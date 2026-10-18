import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart } from "@/lib/week";
import { analyzeMealPhoto } from "@/lib/gemini";
import { tooManyRequests } from "@/lib/rate-limit";

const DAY_MS = 24 * 60 * 60 * 1000;
// 하루는 오전 6시에 바뀐다 (lib/week.ts와 동일)
const DAY_RESET_MS = 6 * 60 * 60 * 1000;
const MAX_PHOTO_CHARS = 6 * 1024 * 1024 * 1.4;

// 이번 주 식단. 주 전체는 날짜별 칼로리 합계만, 사진이 든 목록은 고른 날(day=0 월 ~ 6 일, 기본 오늘) 것만 내려보낸다.
// 방의 두 사람 것이 같이 내려가고, 실험실을 켠 사람만 볼 수 있다
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (!me.labMeal) return NextResponse.json({ people: [], week: [], day: 0, meals: [] });

  const weekStart = getWeekStart();
  const dayStart = (i: number) => new Date(weekStart.getTime() + DAY_RESET_MS + i * DAY_MS);
  const todayIdx = Math.min(Math.max(Math.floor((Date.now() - dayStart(0).getTime()) / DAY_MS), 0), 6);
  // Number(null)이 0(월요일)이 되지 않게, 값이 있을 때만 읽는다
  const dayRaw = new URL(req.url).searchParams.get("day");
  const dayParam = dayRaw === null || dayRaw === "" ? NaN : Number(dayRaw);
  const day = Number.isInteger(dayParam) && dayParam >= 0 && dayParam <= 6 ? dayParam : todayIdx;

  const users = await prisma.user.findMany({ where: { roomId: me.roomId }, select: { id: true, name: true } });
  const ids = users.map((u) => u.id);
  const weekMeals = await prisma.meal.findMany({
    where: { userId: { in: ids }, createdAt: { gte: dayStart(0), lt: dayStart(7) } },
    select: { userId: true, kcal: true, createdAt: true },
  });
  const week = weekMeals.map((m) => ({
    userId: m.userId,
    day: Math.floor((m.createdAt.getTime() - dayStart(0).getTime()) / DAY_MS),
    kcal: m.kcal ?? 0,
  }));

  const meals = await prisma.meal.findMany({
    where: { userId: { in: ids }, createdAt: { gte: dayStart(day), lt: dayStart(day + 1) } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return NextResponse.json({
    // 나를 먼저
    people: [...users].sort((a, b) => Number(b.id === userId) - Number(a.id === userId)),
    week,
    day,
    meals: meals.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: nameOf.get(m.userId) ?? "",
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

// 인증하기로 올린 사진 분류 + 식단 저장.
// mode "auto": Gemini가 음식 사진이면 칼로리를 분석해 식단으로 저장(kind "meal"), 음식이 아니면 저장하지 않고 kind "other"(운동 인증으로 보내면 된다),
//   분석 자체가 안 되면(키 없음/실패) 저장하지 않고 kind "unknown"을 돌려준다.
// mode "meal": 식단으로 확정해서 분석 없이 사진만 저장한다 ("unknown"이었는데 식단 보기에서 올린 경우)
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

  const { photoDataUrl, mode } = await req.json().catch(() => ({}));
  if (typeof photoDataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(photoDataUrl)) {
    return NextResponse.json({ error: "사진이 올바르지 않습니다" }, { status: 400 });
  }
  if (photoDataUrl.length > MAX_PHOTO_CHARS) {
    return NextResponse.json({ error: "사진 용량이 너무 큽니다" }, { status: 400 });
  }

  const forced = mode === "meal";
  const analysis = forced ? null : await analyzeMealPhoto(photoDataUrl);
  if (!forced && !analysis) return NextResponse.json({ kind: "unknown" });
  if (analysis && !analysis.isFood) return NextResponse.json({ kind: "other" });
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
  return NextResponse.json({ kind: "meal", meal: { id: meal.id, analyzed: meal.analyzed, title: meal.title, kcal: meal.kcal } });
}
