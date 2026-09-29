import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { REQUIRED_COUNT, FINE_PER_MISS } from "@/lib/week";

// 통산전적: 전체 기간 누적 인증 횟수 / 승리한 주 수 / 누적 벌금
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const users = await prisma.user.findMany({ where: { roomId: me.roomId } });
  const userIds = users.map((u) => u.id);

  const checkins = await prisma.checkin.findMany({ where: { userId: { in: userIds } } });
  const approvedExcuses = await prisma.excuse.findMany({ where: { userId: { in: userIds }, status: "APPROVED" } });

  const stats = users.map((u) => {
    const myCheckins = checkins.filter((c) => c.userId === u.id);
    const byWeek = new Map<string, number>();
    for (const c of myCheckins) {
      const key = c.weekStart.toISOString();
      byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
    }
    // 사정 봐달라기가 허락된 주는 인증 횟수에 더해지는 게 아니라 그 주 벌금이 통째로 사면된다
    const pardonedWeeks = new Set(
      approvedExcuses.filter((e) => e.userId === u.id).map((e) => e.weekStart.toISOString()),
    );
    const allWeekKeys = new Set([...byWeek.keys(), ...pardonedWeeks]);

    let weeksWon = 0;
    let totalFine = 0;
    for (const key of allWeekKeys) {
      const count = byWeek.get(key) ?? 0;
      if (count >= REQUIRED_COUNT) weeksWon++;
      else if (!pardonedWeeks.has(key)) totalFine += (REQUIRED_COUNT - count) * FINE_PER_MISS;
    }

    return {
      userId: u.id,
      name: u.name,
      totalCheckins: myCheckins.length,
      weeksWon,
      totalWeeks: allWeekKeys.size,
      totalFine,
    };
  });

  return NextResponse.json({ stats });
}
