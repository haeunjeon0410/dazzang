import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { labFinesFor, labFineKey } from "@/lib/lab-fine";
import { REQUIRED_COUNT, FINE_PER_MISS, getWeekStart, getWeekDeadline, isWeekFinalized, isWeekPaused } from "@/lib/week";

// 통산전적: 전체 기간 누적 인증 횟수 / 승리한 주 수 / 누적 벌금
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: { room: { include: { users: { include: { rests: true } }, pauses: true } } },
  });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const users = me.room.users;
  const pauses = me.room.pauses;
  const userIds = users.map((u) => u.id);

  // 서로 상관없는 조회는 한꺼번에 보낸다 (DB가 멀리 있어서 하나씩 기다리면 느리다)
  // 사진 데이터는 크니까 횟수 세는 데 필요한 칸만 가져온다
  const [checkins, approvedExcuses, usedRibbons, labRules] = await Promise.all([
    prisma.checkin.findMany({ where: { userId: { in: userIds } }, select: { userId: true, weekStart: true } }),
    prisma.excuse.findMany({ where: { userId: { in: userIds }, status: "APPROVED" } }),
    prisma.ribbon.findMany({ where: { userId: { in: userIds }, usedWeek: { not: null } } }),
    prisma.labFineRule.findMany({ where: { roomId: me.roomId, amount: { gt: 0 } } }),
  ]);

  // 실험실 벌금: 합의한 주부터 마감된 지난 주까지 (진행 중인 이번 주는 아직 결과가 아니다)
  const labWeeks: Date[] = [];
  const since = labRules.map((r) => r.sinceWeek?.getTime()).filter((t): t is number => typeof t === "number");
  if (since.length > 0) {
    for (let t = Math.min(...since); t < getWeekStart().getTime(); t += 7 * 24 * 60 * 60 * 1000) {
      if (getWeekDeadline(new Date(t)).getTime() < Date.now()) labWeeks.push(new Date(t));
    }
  }
  const labFines = await labFinesFor(me.roomId, users, labWeeks);

  const stats = users.map((u) => {
    const myCheckins = checkins.filter((c) => c.userId === u.id);
    const byWeek = new Map<string, number>();
    for (const c of myCheckins) {
      const key = c.weekStart.toISOString();
      byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
    }
    // 사정 봐달라하기가 허락된 주는 인증 횟수에 더해지는 게 아니라 그 주 벌금이 통째로 사면된다
    const pardonedWeeks = new Set([
      ...approvedExcuses.filter((e) => e.userId === u.id).map((e) => e.weekStart.toISOString()),
      // 리본을 써서 면제한 주도 벌금이 없다
      ...usedRibbons.filter((r) => r.userId === u.id && r.usedWeek).map((r) => r.usedWeek!.toISOString()),
    ]);
    // 승리/벌금은 마감된 주만 센다 (진행 중인 이번 주는 아직 결과가 아님)
    const allWeekKeys = new Set(
      [...byWeek.keys(), ...pardonedWeeks].filter((key) => isWeekFinalized(new Date(key))),
    );

    let weeksWon = 0;
    let totalFine = 0;
    for (const key of allWeekKeys) {
      const count = byWeek.get(key) ?? 0;
      if (count >= REQUIRED_COUNT) weeksWon++;
      else if (!pardonedWeeks.has(key) && !isWeekPaused(u.rests, new Date(key)) && !isWeekPaused(pauses, new Date(key))) totalFine += (REQUIRED_COUNT - count) * FINE_PER_MISS;
    }

    for (const w of labWeeks) {
      const key = w.toISOString();
      if (pardonedWeeks.has(key) || isWeekPaused(u.rests, w) || isWeekPaused(pauses, w)) continue;
      totalFine += labFines.get(labFineKey(u.id, w))?.total ?? 0;
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
