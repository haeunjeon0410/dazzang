import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { labFinesFor, labFineKey } from "@/lib/lab-fine";
import { REQUIRED_COUNT, FINE_PER_MISS, getWeekStart, isWeekFinalized, isWeekPaused, hadJoinedBy } from "@/lib/week";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
    prisma.excuse.findMany({ where: { userId: { in: userIds }, status: "APPROVED" }, select: { userId: true, weekStart: true } }),
    prisma.ribbon.findMany({ where: { userId: { in: userIds }, usedWeek: { not: null } }, select: { userId: true, usedWeek: true } }),
    // 지금은 0원으로 바꾼 약속도 읽는다: 바꾸기 전 주들에는 이전 금액(prevAmount)이 적용됐다
    prisma.labFineRule.findMany({ where: { roomId: me.roomId } }),
  ]);

  // 실험실 벌금: 약속이 처음 시작된 주부터 마감된 지난 주까지 (진행 중인 이번 주는 아직 결과가 아니다).
  // 주마다 얼마가 적용되는지는 labFinesFor가 따진다 (금액을 바꾸기 전 주는 이전 금액, 약속이 없던 주는 0원)
  const labWeeks: Date[] = [];
  const since = labRules.flatMap((r) => [r.sinceWeek, r.prevSinceWeek]).filter((d): d is Date => !!d).map((d) => d.getTime());
  if (since.length > 0) {
    for (let t = Math.min(...since); t < getWeekStart().getTime(); t += WEEK_MS) labWeeks.push(new Date(t));
  }
  const labFines = await labFinesFor(me.roomId, users, labWeeks);

  // 방에서 누구라도 기록(인증, 사정 봐주기, 리본 사용)이 있는 마감된 주가 "진행한 주"다.
  // 사람마다 따로 세면, 한 번도 인증하지 않은 주가 그 사람의 통산에서 통째로 빠져서 벌금 15,000원이 누락된다
  const roomWeekKeys = [
    ...new Set([
      ...checkins.map((c) => c.weekStart.toISOString()),
      ...approvedExcuses.map((e) => e.weekStart.toISOString()),
      ...usedRibbons.map((r) => r.usedWeek!.toISOString()),
    ]),
  ].filter((key) => isWeekFinalized(new Date(key)));

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
      ...usedRibbons.filter((r) => r.userId === u.id).map((r) => r.usedWeek!.toISOString()),
    ]);
    // 벌금이 없는 주: 사면된 주, 혼자 쉰 주, 방 전체가 쉰 주
    const noFine = (w: Date) => pardonedWeeks.has(w.toISOString()) || isWeekPaused(u.rests, w) || isWeekPaused(pauses, w);
    // 승리/벌금은 마감된 주만 센다 (진행 중인 이번 주는 아직 결과가 아님). 내가 방에 들어오기 전에 끝난 주는 내 전적이 아니다
    const myWeekKeys = roomWeekKeys.filter((key) => hadJoinedBy(u, new Date(key)));

    let weeksWon = 0;
    let totalFine = 0;
    for (const key of myWeekKeys) {
      const count = byWeek.get(key) ?? 0;
      if (count >= REQUIRED_COUNT) weeksWon++;
      else if (!noFine(new Date(key))) totalFine += (REQUIRED_COUNT - count) * FINE_PER_MISS;
    }

    for (const w of labWeeks) {
      if (noFine(w) || !hadJoinedBy(u, w)) continue;
      totalFine += labFines.get(labFineKey(u.id, w))?.total ?? 0;
    }

    return {
      userId: u.id,
      name: u.name,
      totalCheckins: myCheckins.length,
      weeksWon,
      totalWeeks: myWeekKeys.length,
      totalFine,
    };
  });

  return NextResponse.json({ stats });
}
