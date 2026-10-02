import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart, getWeekDeadline, getDayRange, REQUIRED_COUNT, FINE_PER_MISS } from "@/lib/week";

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const weekParam = req.nextUrl.searchParams.get("weekStart");
  const weekStart = weekParam ? new Date(weekParam) : getWeekStart();
  const deadline = getWeekDeadline(weekStart);

  const users = await prisma.user.findMany({ where: { roomId: me.roomId } });
  const userIds = users.map((u) => u.id);
  const checkins = await prisma.checkin.findMany({
    where: { weekStart, userId: { in: userIds } },
    orderBy: { createdAt: "asc" },
  });
  const approvedExcuses = await prisma.excuse.findMany({
    where: { weekStart, status: "APPROVED", userId: { in: userIds } },
  });

  const summary = users.map((u) => {
    const mine = checkins.filter((c) => c.userId === u.id);
    // 사정 봐달라기가 허락되면 인증 1회로 치환되는 게 아니라, 그 주 벌금 자체가 통째로 사면된다
    const pardoned = approvedExcuses.some((e) => e.userId === u.id);
    const count = mine.length;
    const shortfall = Math.max(0, REQUIRED_COUNT - count);
    return {
      userId: u.id,
      name: u.name,
      count,
      pardoned,
      shortfall,
      fine: pardoned ? 0 : shortfall * FINE_PER_MISS,
      checkins: mine.map((c) => ({ id: c.id, photoUrl: c.photoUrl, createdAt: c.createdAt, userId: c.userId, liked: c.liked })),
    };
  });

  return NextResponse.json({
    weekStart,
    deadline,
    finalized: Date.now() > deadline.getTime(),
    summary,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { photoDataUrl, takenAt } = await req.json();
  if (!photoDataUrl || typeof photoDataUrl !== "string" || !photoDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "사진이 올바르지 않습니다" }, { status: 400 });
  }
  if (photoDataUrl.length > MAX_PHOTO_BYTES * 1.4) {
    return NextResponse.json({ error: "사진 용량이 너무 큽니다" }, { status: 400 });
  }

  // 사진 조작 방지: 사진에 찍힌 촬영 시각(EXIF)으로 인증한다. 촬영 정보가 없는 사진(캡처 등)은 업로드한 지금으로 인정
  const now = new Date();
  const shotAt = typeof takenAt === "string" ? new Date(takenAt) : now;
  if (Number.isNaN(shotAt.getTime()) || shotAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    return NextResponse.json({ error: "사진의 촬영 날짜가 올바르지 않아요" }, { status: 400 });
  }

  // 항상 서버 현재 시각 기준 "이번 주"에 찍은 사진만 받는다 (지난주 사진으로 소급 불가)
  const weekStart = getWeekStart(now);
  if (shotAt.getTime() < weekStart.getTime()) {
    const kst = new Date(shotAt.getTime() + 9 * 60 * 60 * 1000);
    return NextResponse.json(
      { error: `이번 주에 찍은 사진만 인증할 수 있어요 (이 사진은 ${kst.getUTCMonth() + 1}/${kst.getUTCDate()}에 찍은 사진이에요)` },
      { status: 400 },
    );
  }

  // 하루 1장만 인정: 찍은 날에 이미 올린 게 있으면 지우고 새로 올린 걸로 교체
  const { start, end } = getDayRange(shotAt);
  await prisma.checkin.deleteMany({
    where: { userId, createdAt: { gte: start, lte: end } },
  });

  // createdAt = 촬영 시각 → 캘린더 요일 칸, 하루 1장 규칙이 모두 찍은 날 기준으로 동작
  const checkin = await prisma.checkin.create({
    data: { userId, photoUrl: photoDataUrl, weekStart, createdAt: shotAt },
  });

  return NextResponse.json({ checkin: { id: checkin.id, createdAt: checkin.createdAt } });
}
