import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeMealPhoto } from "@/lib/meal-ai";
import { draftFromAnalysis } from "@/lib/meal-input";
import { sendPushToUser } from "@/lib/push";
import { tooManyRequests } from "@/lib/rate-limit";
import { quotaMessage, takeAiQuota } from "@/lib/ai-quota";
import { getWeekStart } from "@/lib/week";
import { checkThisWeek, readTakenAt } from "@/lib/photo-date";

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

// 아이폰 단축어(동작 버튼)가 식단 사진을 바로 올리는 주소.
// 쿠키가 없어서, 설정에서 만든 개인 코드로 누구의 사진인지 알아낸다. 코드는 주소 끝(?t=코드)이나 Authorization 헤더로 받는다.
// 사진은 파일 그대로(본문 전체, 또는 양식의 첫 파일)나 예전 방식(JSON의 imageBase64)으로 받는다.
// 파일로 보내면 응답도 단축어가 바로 "결과 보기"에 띄울 수 있게 글자로 돌려준다.
// 사진은 AI가 읽으면 바로 기록되어 친구와 공유된다(앱에서 나중에 고칠 수 있다). AI가 못 읽었을 때만 "확인 대기" 초안으로 남는다.
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
    await sendPushToUser(user, { title: "식단을 못 올렸어요", body: message }).catch(() => {});
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
  const photoUrl = `data:${mimeType};base64,${image.toString("base64")}`;

  const quota = await takeAiQuota(user.id, "photo");
  if (quota !== "ok") return fail(`${quotaMessage(quota)}. 나중에 다시 올려 주세요`);
  const analysis = await analyzeMealPhoto(photoUrl);

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
    const message = `몸무게 ${analysis.scaleKg}kg로 기록했어요`;
    await sendPushToUser(user, { title: "몸무게 기록", body: message }).catch(() => {});
    return reply(true, message);
  }

  // 음식으로 못 읽었어도(음식이 아니라고 했거나 분석 실패) 사진은 버리지 않는다: 확인 대기로 남겨 앱에서 직접 적거나 지운다
  const draft = analysis?.isFood ? draftFromAnalysis(analysis) : null;
  await prisma.meal.create({
    data: {
      userId: user.id,
      photoUrl,
      analyzed: !!draft,
      title: draft?.title ?? null,
      kcal: draft?.kcal ?? null,
      items: draft?.items ?? undefined,
      fraction: 1,
      // AI가 읽은 사진은 바로 기록하고, 못 읽은 사진만 확인 대기로 남긴다
      confirmed: !!draft,
      source: "shortcut",
    },
  });

  const message = draft
    ? `${draft.title} 약 ${draft.kcal.toLocaleString()} kcal로 기록했어요`
    : analysis
      ? "음식으로 읽지 못했어요. 앱에서 확인하고 직접 적어 주세요"
      : "사진은 올렸어요. 분석은 못 했으니 앱에서 직접 적어 주세요";
  // 푸시가 안 가도 식단 올리기는 성공이다
  await sendPushToUser(user, { title: draft ? "식단 기록" : "식단 확인", body: message }).catch(() => {});
  return reply(true, message);
}
