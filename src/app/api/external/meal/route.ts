import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeMealPhoto } from "@/lib/meal-ai";
import { draftFromAnalysis } from "@/lib/meal-input";
import { sendPushToUser } from "@/lib/push";
import { tooManyRequests } from "@/lib/rate-limit";
import { quotaMessage, takeAiQuota } from "@/lib/ai-quota";
import { getWeekStart } from "@/lib/week";
import { checkThisWeek, readTakenAt } from "@/lib/photo-date";
import { createCheckin } from "@/lib/checkin-create";
import { shrinkPhoto } from "@/lib/photo-resize";

// AI 분석은 몇 초 걸리고 재시도도 하므로 서버 함수가 중간에 끊기지 않게 넉넉히 둔다
export const maxDuration = 60;

// 저장하는 사진은 글자(base64)로 바뀌며 3분의 1 커지고, Vercel은 요청 하나를 4.5MB까지만 받는다
const MAX_IMAGE_BYTES = 3_000_000;

// 사진 앞부분(매직 바이트)을 보고 종류를 알아낸다. 단축어가 보내는 Content-Type은 믿기 어려워서 직접 확인한다
function sniff(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "heic" | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.length > 12 && buf.subarray(4, 8).toString() === "ftyp") return "heic";
  return null;
}

// 아이폰 단축어(동작 버튼)가 사진을 바로 올리는 주소. AI가 음식이면 식단, 체중계면 몸무게, 운동이면 운동 인증으로 알아서 나눈다.
// 쿠키가 없어서, 설정에서 만든 개인 코드로 누구의 사진인지 알아낸다. 코드는 주소 끝(?t=코드)이나 Authorization 헤더로 받는다.
// 사진은 파일 그대로(본문 전체, 또는 양식의 첫 파일)나 예전 방식(JSON의 imageBase64)으로 받는다.
// 파일로 보내면 응답도 단축어가 바로 "결과 보기"에 띄울 수 있게 글자로 돌려준다.
// 사진은 AI가 읽으면 바로 기록되어 친구와 공유된다(앱에서 나중에 고칠 수 있다). 분석이 안 되면 저장하지 않고 다시 올리게 한다.
export async function POST(req: NextRequest) {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  const asJson = type.includes("application/json");
  const reply = (ok: boolean, message: string, status = 200) =>
    asJson
      ? NextResponse.json({ ok, message }, { status })
      : new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const auth = req.headers.get("authorization") ?? "";
  const token = (auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("t") ?? "").trim();
  if (token.length < 16) return reply(false, "연결 코드가 올바르지 않아요. 앱에서 주소를 다시 복사해 주세요", 401);

  const user = await prisma.user.findUnique({ where: { mealToken: token } });
  if (!user) return reply(false, "연결 코드가 올바르지 않아요. 앱에서 주소를 다시 복사해 주세요", 401);
  // 사진이 못 올라간 이유는 단축어 화면 대신 푸시로 알려 준다 (단축어에 "콘텐츠 보기" 단계를 두지 않는다)
  const fail = async (message: string, status = 200) => {
    await sendPushToUser(user, { title: "사진을 못 올렸어요", body: message }).catch(() => {});
    return reply(false, message, status);
  };
  if (tooManyRequests(`meal-ext:${user.id}`, 10)) return fail("너무 빨라요. 잠시 뒤에 다시 보내 주세요", 429);

  // 너무 큰 요청은 본문을 읽기 전에 거절한다 (사진 3MB, 양식 머리글 여유 포함)
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES * 1.5) {
    return fail("사진이 너무 커요. 이미지 크기 변경 단계를 확인해 주세요", 413);
  }

  // 사진 꺼내기
  let image: Buffer | null = null;
  if (asJson) {
    const body = await req.json().catch(() => null);
    const b64 = typeof body?.imageBase64 === "string" ? body.imageBase64.replace(/\s+/g, "") : "";
    image = b64 ? Buffer.from(b64, "base64") : null;
  } else if (type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form ? [...form.values()].find((v): v is File => typeof v !== "string") : null;
    image = file ? Buffer.from(await file.arrayBuffer()) : null;
  } else {
    image = Buffer.from(await req.arrayBuffer());
  }
  if (!image || image.length === 0) return fail("사진이 안 왔어요. 요청 본문에 사진이 들어갔는지 확인해 주세요", 400);
  if (image.length > MAX_IMAGE_BYTES) return fail("사진이 너무 커요. 이미지 크기 변경 단계를 확인해 주세요", 413);
  const mimeType = sniff(image);
  if (mimeType === "heic") return fail("사진이 HEIC 형식이에요. 이미지 변환(JPEG) 단계를 확인해 주세요", 415);
  if (!mimeType) return fail("사진 파일이 아닌 것 같아요", 415);
  // 원본은 수 MB라 AI가 거절하거나 느려질 수 있어서, 앱과 같게 줄인 사진으로 분석하고 저장한다 (촬영 시각은 원본에서 읽는다)
  const small = await shrinkPhoto(image);
  const photoUrl = `data:${small?.mimeType ?? mimeType};base64,${(small?.data ?? image).toString("base64")}`;

  const quota = await takeAiQuota(user.id, "photo");
  if (quota !== "ok") return fail(`${quotaMessage(quota)}. 나중에 다시 올려 주세요`);
  // 분석이 예기치 않게 터져도 아무 반응이 없게 두지 않고 알림으로 알린다
  const analysis = await analyzeMealPhoto(photoUrl).catch((e) => {
    console.error("[meal] analyze", e instanceof Error ? e.message : e);
    return null;
  });

  // 체중계 사진은 식단이 아니라 몸무게로 기록한다 (몸무게 인증을 켠 사람만). 숫자가 틀렸으면 앱의 몸무게 창에서 다시 기록한다
  if (analysis?.scaleKg) {
    const dateCheck = checkThisWeek(await readTakenAt(image));
    if (!dateCheck.ok) return fail(dateCheck.error);
    const weekStart = getWeekStart();
    await prisma.weightLog.upsert({
      where: { userId_weekStart: { userId: user.id, weekStart } },
      create: { userId: user.id, weekStart, kg: analysis.scaleKg },
      update: { kg: analysis.scaleKg },
    });
    const message = `몸무게에 올라갔어요 · ${analysis.scaleKg}kg`;
    await sendPushToUser(user, { title: "⚖️ 몸무게에 올라갔어요", body: `${analysis.scaleKg}kg로 기록했어요` }).catch(() => {});
    return reply(true, message);
  }

  // 운동 사진은 운동 인증으로 올린다 (이번 주에 찍은 사진만)
  if (analysis?.category === "workout") {
    const result = await createCheckin(user.id, photoUrl, await readTakenAt(image));
    if (!result.ok) return fail(result.error);
    const message = "운동에 올라갔어요";
    await sendPushToUser(user, { title: "💪 운동에 올라갔어요", body: "운동 인증으로 올렸어요" }).catch(() => {});
    return reply(true, message);
  }
  // 어느 쪽으로도 못 읽은 사진은 저장하지 않고 다시 올리게 한다
  if (analysis?.category === "other") return fail("사진을 인식하지 못했어요. 다시 올려 주세요");

  // 분석 자체가 안 된 사진(키 없음, 호출 실패)은 칼로리를 못 구하니 저장하지 않고 다시 올리게 한다
  if (!analysis) return fail("분석하지 못했어요. 잠시 뒤에 다시 올려 주세요");

  // 여기까지 오는 건 음식 사진뿐이다 (체중계, 운동, 기타, 분석 실패는 위에서 걸러진다)
  const draft = draftFromAnalysis(analysis);
  await prisma.meal.create({
    data: {
      userId: user.id,
      photoUrl,
      analyzed: true,
      title: draft.title,
      kcal: draft.kcal,
      items: draft.items,
      fraction: 1,
      confirmed: true,
      source: "shortcut",
    },
  });

  const detail = `${draft.title} 약 ${draft.kcal.toLocaleString()} kcal`;
  // 푸시가 안 가도 식단 올리기는 성공이다
  await sendPushToUser(user, { title: "🍽️ 식단에 올라갔어요", body: detail }).catch(() => {});
  const message = `식단에 올라갔어요 · ${detail}`;
  return reply(true, message);
}
