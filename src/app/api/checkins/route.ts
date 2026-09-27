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
    const excusedCount = approvedExcuses.filter((e) => e.userId === u.id).length;
    const count = mine.length + excusedCount;
    const shortfall = Math.max(0, REQUIRED_COUNT - count);
    return {
      userId: u.id,
      name: u.name,
      count,
      realCount: mine.length,
      excusedCount,
      shortfall,
      fine: shortfall * FINE_PER_MISS,
      checkins: mine.map((c) => ({ id: c.id, photoUrl: c.photoUrl, createdAt: c.createdAt })),
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

  const { photoDataUrl } = await req.json();
  if (!photoDataUrl || typeof photoDataUrl !== "string" || !photoDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "사진이 올바르지 않습니다" }, { status: 400 });
  }
  if (photoDataUrl.length > MAX_PHOTO_BYTES * 1.4) {
    return NextResponse.json({ error: "사진 용량이 너무 큽니다" }, { status: 400 });
  }

  // 항상 서버 현재 시각 기준 "이번 주"에만 기록한다 (마감 지난 주는 절대 소급 불가)
  const weekStart = getWeekStart();

  // 하루 1장만 인정: 오늘 이미 올린 게 있으면 지우고 새로 올린 걸로 교체
  const { start, end } = getDayRange();
  await prisma.checkin.deleteMany({
    where: { userId, createdAt: { gte: start, lte: end } },
  });

  const checkin = await prisma.checkin.create({
    data: { userId, photoUrl: photoDataUrl, weekStart },
  });

  return NextResponse.json({ checkin: { id: checkin.id, createdAt: checkin.createdAt } });
}
