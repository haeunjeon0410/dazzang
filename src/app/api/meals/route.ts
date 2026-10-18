import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getDayRange } from "@/lib/week";
import { analyzeMealPhoto } from "@/lib/gemini";
import { tooManyRequests } from "@/lib/rate-limit";

const MAX_PHOTO_CHARS = 6 * 1024 * 1024 * 1.4;

// 오늘(오전 6시 기준) 올라온 식단. 방의 두 사람 것이 같이 내려가고, 실험실을 켠 사람만 볼 수 있다
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (!me.labMeal) return NextResponse.json({ meals: [] });

  const { start } = getDayRange();
  const meals = await prisma.meal.findMany({
    where: { createdAt: { gte: start }, user: { roomId: me.roomId } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { name: true } } },
  });
  return NextResponse.json({
    meals: meals.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      photoUrl: m.photoUrl,
      analyzed: m.analyzed,
      title: m.title,
      kcal: m.kcal,
      items: m.items,
      comment: m.comment,
      createdAt: m.createdAt,
    })),
  });
}

// 식단 사진 올리기: Gemini로 칼로리를 분석해 저장한다. 분석이 안 돼도 사진은 저장한다
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (!me.labMeal) return NextResponse.json({ error: "실험실에서 식단 인증을 먼저 켜 주세요" }, { status: 403 });
  // 무료 한도를 아끼기 위해 사람당 분당 6장까지
  if (tooManyRequests(`meal:${userId}`, 6)) {
    return NextResponse.json({ error: "너무 빨라요. 잠시 뒤에 다시 올려 주세요" }, { status: 429 });
  }

  const { photoDataUrl } = await req.json().catch(() => ({}));
  if (typeof photoDataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(photoDataUrl)) {
    return NextResponse.json({ error: "사진이 올바르지 않습니다" }, { status: 400 });
  }
  if (photoDataUrl.length > MAX_PHOTO_CHARS) {
    return NextResponse.json({ error: "사진 용량이 너무 큽니다" }, { status: 400 });
  }

  const analysis = await analyzeMealPhoto(photoDataUrl);
  const meal = await prisma.meal.create({
    data: {
      userId,
      photoUrl: photoDataUrl,
      analyzed: !!analysis,
      title: analysis?.title,
      kcal: analysis?.kcal,
      items: analysis?.items,
      comment: analysis?.comment || null,
    },
  });
  return NextResponse.json({ meal: { id: meal.id, analyzed: meal.analyzed, title: meal.title, kcal: meal.kcal } });
}
