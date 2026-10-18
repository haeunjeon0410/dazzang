import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeMealPhoto } from "@/lib/meal-ai";
import { draftFromAnalysis } from "@/lib/meal-input";
import { sendPushToUser } from "@/lib/push";
import { tooManyRequests } from "@/lib/rate-limit";
import { quotaMessage, takeAiQuota } from "@/lib/ai-quota";

const MAX_BASE64_CHARS = 4_000_000;
const MIME_OK = new Set(["image/jpeg", "image/png", "image/webp"]);

// 아이폰 단축어(액션 버튼)가 식단 사진을 바로 올리는 주소.
// 쿠키가 없어서, 설정에서 만든 개인 토큰(Authorization: Bearer)으로 누구의 사진인지 알아낸다.
// 사진은 AI가 읽은 뒤 "확인 대기" 초안으로 저장되고, 본인이 앱에서 확인(필요하면 수정)해야 친구와 공유된다.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 16) return NextResponse.json({ ok: false, message: "토큰이 올바르지 않아요" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { mealToken: token } });
  if (!user) return NextResponse.json({ ok: false, message: "토큰이 올바르지 않아요" }, { status: 401 });
  if (!user.labMeal) return NextResponse.json({ ok: false, message: "앱의 실험실에서 식단 인증을 먼저 켜 주세요" }, { status: 403 });
  if (tooManyRequests(`meal-ext:${user.id}`, 10)) {
    return NextResponse.json({ ok: false, message: "너무 빨라요. 잠시 뒤에 다시 보내 주세요" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64.replace(/\s+/g, "") : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";
  if (!imageBase64 || imageBase64.length > MAX_BASE64_CHARS || !MIME_OK.has(mimeType)) {
    return NextResponse.json({ ok: false, message: "사진이 올바르지 않아요" }, { status: 400 });
  }
  const photoUrl = `data:${mimeType};base64,${imageBase64}`;

  const quota = await takeAiQuota(user.id, "photo");
  if (quota !== "ok") {
    return NextResponse.json({ ok: false, message: `${quotaMessage(quota)}. 나중에 다시 올려 주세요` });
  }
  const analysis = await analyzeMealPhoto(photoUrl);
  if (analysis && !analysis.isFood) {
    return NextResponse.json({ ok: false, message: "음식 사진이 아닌 것 같아요" });
  }

  const draft = analysis ? draftFromAnalysis(analysis) : null;
  await prisma.meal.create({
    data: {
      userId: user.id,
      photoUrl,
      analyzed: !!draft,
      title: draft?.title ?? null,
      kcal: draft?.kcal ?? null,
      items: draft?.items ?? undefined,
      fraction: 1,
      confirmed: false,
      source: "shortcut",
    },
  });

  const message = draft
    ? `${draft.title} 약 ${draft.kcal.toLocaleString()} kcal로 읽었어요. 앱에서 확인해 주세요`
    : "사진은 올렸어요. 분석은 못 했으니 앱에서 직접 적어 주세요";
  // 푸시가 안 가도 식단 올리기는 성공이다
  await sendPushToUser(user, { title: "식단 확인", body: message }).catch(() => {});
  return NextResponse.json({ ok: true, message });
}
