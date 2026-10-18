import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart } from "@/lib/week";
import { analyzeMealPhoto } from "@/lib/meal-ai";
import { draftFromAnalysis, parseMealInput } from "@/lib/meal-input";
import { tooManyRequests } from "@/lib/rate-limit";

const DAY_MS = 24 * 60 * 60 * 1000;
// 하루는 오전 6시에 바뀐다 (lib/week.ts와 동일)
const DAY_RESET_MS = 6 * 60 * 60 * 1000;
const MAX_PHOTO_CHARS = 6 * 1024 * 1024 * 1.4;

const mealView = (m: {
  id: string;
  userId: string;
  photoUrl: string;
  analyzed: boolean;
  title: string | null;
  kcal: number | null;
  items: unknown;
  fraction: number;
  confirmed: boolean;
  source: string;
  createdAt: Date;
}, name: string) => ({
  id: m.id,
  userId: m.userId,
  name,
  photoUrl: m.photoUrl,
  analyzed: m.analyzed,
  title: m.title,
  kcal: m.kcal,
  items: m.items,
  fraction: m.fraction,
  confirmed: m.confirmed,
  source: m.source,
  createdAt: m.createdAt,
});

// 이번 주 식단. 주 전체는 날짜별 칼로리 합계만, 사진이 든 목록은 고른 날(day=0 월 ~ 6 일, 기본 오늘) 것만 내려보낸다.
// 방의 두 사람 것이 같이 내려가고, 실험실을 켠 사람만 볼 수 있다.
// 단축어로 올라와 아직 확인하지 않은 초안은 올린 본인에게만 보이고 주간 합계에도 들어가지 않는다.
// ?pending=1 이면 내 확인 대기 초안만 사진과 함께 돌려준다
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (!me.labMeal) return NextResponse.json({ people: [], week: [], day: 0, meals: [], pendingCount: 0 });

  const url = new URL(req.url);
  if (url.searchParams.get("pending")) {
    const drafts = await prisma.meal.findMany({
      where: { userId, confirmed: false },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    return NextResponse.json({ drafts: drafts.map((m) => mealView(m, me.name)) });
  }

  const weekStart = getWeekStart();
  const dayStart = (i: number) => new Date(weekStart.getTime() + DAY_RESET_MS + i * DAY_MS);
  const todayIdx = Math.min(Math.max(Math.floor((Date.now() - dayStart(0).getTime()) / DAY_MS), 0), 6);
  const dayRaw = url.searchParams.get("day");
  const dayParam = dayRaw === null || dayRaw === "" ? NaN : Number(dayRaw);
  const day = Number.isInteger(dayParam) && dayParam >= 0 && dayParam <= 6 ? dayParam : todayIdx;

  const users = await prisma.user.findMany({ where: { roomId: me.roomId }, select: { id: true, name: true } });
  const ids = users.map((u) => u.id);
  const weekMeals = await prisma.meal.findMany({
    where: { userId: { in: ids }, confirmed: true, createdAt: { gte: dayStart(0), lt: dayStart(7) } },
    select: { userId: true, kcal: true, createdAt: true },
  });
  const week = weekMeals.map((m) => ({
    userId: m.userId,
    day: Math.floor((m.createdAt.getTime() - dayStart(0).getTime()) / DAY_MS),
    kcal: m.kcal ?? 0,
  }));
  const pendingCount = await prisma.meal.count({ where: { userId, confirmed: false } });

  // day=none: 표만 필요할 때라 사진이 든 목록은 건너뛴다
  const meals =
    dayRaw === "none"
      ? []
      : await prisma.meal.findMany({
          where: { userId: { in: ids }, confirmed: true, createdAt: { gte: dayStart(day), lt: dayStart(day + 1) } },
          orderBy: { createdAt: "desc" },
          take: 30,
        });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  return NextResponse.json({
    // 나를 먼저
    people: [...users].sort((a, b) => Number(b.id === userId) - Number(a.id === userId)),
    week,
    day,
    pendingCount,
    meals: meals.map((m) => mealView(m, nameOf.get(m.userId) ?? "")),
  });
}

// 식단 사진 올리기는 두 단계다.
// mode "analyze": 사진을 AI로 읽어서 저장하지 않고 초안만 돌려준다.
//   음식이면 kind "draft"(analysis: 이름, 음식별 칼로리), 음식이 아니면 kind "other"(운동 인증으로 보내면 된다),
//   분석 자체가 안 되면(키 없음/실패) kind "unknown"(직접 적게 한다).
// mode "save": 사용자가 확인하거나 고친 값(title, items, fraction)으로 사진과 함께 저장한다.
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (!me.labMeal) return NextResponse.json({ error: "실험실에서 식단 인증을 먼저 켜 주세요" }, { status: 403 });
  // 사진 분석에는 크레딧이 들어서 사람당 분당 6장까지
  if (tooManyRequests(`meal:${userId}`, 6)) {
    return NextResponse.json({ error: "너무 빨라요. 잠시 뒤에 다시 올려 주세요" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const { photoDataUrl, mode } = body;
  if (typeof photoDataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(photoDataUrl)) {
    return NextResponse.json({ error: "사진이 올바르지 않습니다" }, { status: 400 });
  }
  if (photoDataUrl.length > MAX_PHOTO_CHARS) {
    return NextResponse.json({ error: "사진 용량이 너무 큽니다" }, { status: 400 });
  }

  if (mode === "save") {
    const input = parseMealInput(body);
    if (!input) return NextResponse.json({ error: "음식 이름을 적어 주세요" }, { status: 400 });
    const meal = await prisma.meal.create({
      data: {
        userId,
        photoUrl: photoDataUrl,
        analyzed: !!body.analyzed,
        title: input.title,
        kcal: input.kcal,
        items: input.items,
        fraction: input.fraction,
        confirmed: true,
        source: "app",
      },
    });
    return NextResponse.json({ kind: "meal", meal: { id: meal.id, title: meal.title, kcal: meal.kcal } });
  }

  const analysis = await analyzeMealPhoto(photoDataUrl);
  if (!analysis) return NextResponse.json({ kind: "unknown" });
  if (!analysis.isFood) return NextResponse.json({ kind: "other" });
  return NextResponse.json({ kind: "draft", draft: draftFromAnalysis(analysis) });
}
