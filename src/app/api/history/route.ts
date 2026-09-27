import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart, getWeekDeadline, REQUIRED_COUNT, FINE_PER_MISS } from "@/lib/week";

const WEEKS_BACK = 8;

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const users = await prisma.user.findMany({ where: { roomId: me.roomId } });
  const userIds = users.map((u) => u.id);
  const currentWeekStart = getWeekStart();

  const weeks = [];
  for (let i = 1; i <= WEEKS_BACK; i++) {
    const weekStart = new Date(currentWeekStart.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const deadline = getWeekDeadline(weekStart);

    const checkins = await prisma.checkin.findMany({ where: { weekStart, userId: { in: userIds } } });
    const settlements = await prisma.settlement.findMany({ where: { weekStart, userId: { in: userIds } } });
    const approvedExcuses = await prisma.excuse.findMany({
      where: { weekStart, status: "APPROVED", userId: { in: userIds } },
    });

    const summary = users.map((u) => {
      const count =
        checkins.filter((c) => c.userId === u.id).length +
        approvedExcuses.filter((e) => e.userId === u.id).length;
      const shortfall = Math.max(0, REQUIRED_COUNT - count);
      const settlement = settlements.find((s) => s.userId === u.id);
      return {
        userId: u.id,
        name: u.name,
        count,
        shortfall,
        fine: shortfall * FINE_PER_MISS,
        settled: settlement?.settled ?? false,
      };
    });

    // 아무도 인증 기록이 없는 아주 오래된 빈 주는 건너뛴다
    if (summary.every((s) => s.count === 0) && i > 2) continue;

    weeks.push({ weekStart, deadline, summary });
  }

  return NextResponse.json({ weeks });
}
