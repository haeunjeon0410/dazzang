import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart, getWeekDeadline, REQUIRED_COUNT, FINE_PER_MISS, isUserResting, isWeekPaused } from "@/lib/week";

const WEEKS_BACK = 8;

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId }, include: { room: true } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const users = await prisma.user.findMany({ where: { roomId: me.roomId } });
  const userIds = users.map((u) => u.id);
  const currentWeekStart = getWeekStart();
  const pauses = await prisma.roomPause.findMany({ where: { roomId: me.roomId } });

  // 8주치를 주마다 따로 조회하지 않고 한 번에 가져와서 주별로 나눈다
  const weekStarts = Array.from(
    { length: WEEKS_BACK },
    (_, k) => new Date(currentWeekStart.getTime() - (k + 1) * 7 * 24 * 60 * 60 * 1000),
  );
  const [allCheckins, allSettlements, allExcuses] = await Promise.all([
    prisma.checkin.findMany({ where: { weekStart: { in: weekStarts }, userId: { in: userIds } } }),
    prisma.settlement.findMany({ where: { weekStart: { in: weekStarts }, userId: { in: userIds } } }),
    prisma.excuse.findMany({ where: { weekStart: { in: weekStarts }, status: "APPROVED", userId: { in: userIds } } }),
  ]);

  const weeks = [];
  for (let i = 1; i <= WEEKS_BACK; i++) {
    const weekStart = weekStarts[i - 1];
    const deadline = getWeekDeadline(weekStart);

    const sameWeek = <T extends { weekStart: Date }>(rows: T[]) =>
      rows.filter((r) => r.weekStart.getTime() === weekStart.getTime());
    const checkins = sameWeek(allCheckins);
    const settlements = sameWeek(allSettlements);
    const approvedExcuses = sameWeek(allExcuses);

    const summary = users.map((u) => {
      const count = checkins.filter((c) => c.userId === u.id).length;
      const pardoned = approvedExcuses.some((e) => e.userId === u.id) || isUserResting(u, weekStart) || isWeekPaused(pauses, weekStart);
      const shortfall = Math.max(0, REQUIRED_COUNT - count);
      const settlement = settlements.find((s) => s.userId === u.id);
      return {
        userId: u.id,
        name: u.name,
        count,
        pardoned,
        shortfall,
        fine: pardoned ? 0 : shortfall * FINE_PER_MISS,
        settled: settlement?.settled ?? false,
      };
    });

    // 방이 생기기 전 주는 애초에 존재할 수 없으니 건너뛴다
    if (deadline <= me.room.createdAt) continue;

    // 아무도 인증 기록이 없는 아주 오래된 빈 주는 건너뛴다
    if (summary.every((s) => s.count === 0) && i > 2) continue;

    weeks.push({ weekStart, deadline, summary });
  }

  return NextResponse.json({ weeks });
}
