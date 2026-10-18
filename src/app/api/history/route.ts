import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { labFinesFor, labFineKey, noLabFine } from "@/lib/lab-fine";
import { getWeekStart, getWeekDeadline, REQUIRED_COUNT, FINE_PER_MISS, isWeekPaused } from "@/lib/week";

const WEEKS_BACK = 8;

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId }, include: { room: true } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const users = await prisma.user.findMany({ where: { roomId: me.roomId }, include: { rests: true } });
  const userIds = users.map((u) => u.id);
  const currentWeekStart = getWeekStart();
  const pauses = await prisma.roomPause.findMany({ where: { roomId: me.roomId } });

  // 8주치를 주마다 따로 조회하지 않고 한 번에 가져와서 주별로 나눈다
  const weekStarts = Array.from(
    { length: WEEKS_BACK },
    (_, k) => new Date(currentWeekStart.getTime() - (k + 1) * 7 * 24 * 60 * 60 * 1000),
  );
  const DAY_MS = 24 * 60 * 60 * 1000;
  const oldest = weekStarts[weekStarts.length - 1];
  const [allCheckins, allSettlements, allExcuses, allRibbons, allMeals] = await Promise.all([
    prisma.checkin.findMany({ where: { weekStart: { in: weekStarts }, userId: { in: userIds } } }),
    prisma.settlement.findMany({ where: { weekStart: { in: weekStarts }, userId: { in: userIds } } }),
    prisma.excuse.findMany({ where: { weekStart: { in: weekStarts }, status: "APPROVED", userId: { in: userIds } } }),
    prisma.ribbon.findMany({ where: { usedWeek: { in: weekStarts }, userId: { in: userIds } } }),
    // 주별 하루 평균 칼로리를 내려주려고 식단은 칼로리와 시각만 가져온다
    prisma.meal.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: oldest, lt: currentWeekStart } },
      select: { userId: true, kcal: true, createdAt: true },
    }),
  ]);

  const labFines = await labFinesFor(me.roomId, users, weekStarts);

  const weeks = [];
  for (let i = 1; i <= WEEKS_BACK; i++) {
    const weekStart = weekStarts[i - 1];
    const deadline = getWeekDeadline(weekStart);

    const sameWeek = <T extends { weekStart: Date }>(rows: T[]) =>
      rows.filter((r) => r.weekStart.getTime() === weekStart.getTime());
    const checkins = sameWeek(allCheckins);
    const settlements = sameWeek(allSettlements);
    const approvedExcuses = sameWeek(allExcuses);
    const usedRibbons = allRibbons.filter((r) => r.usedWeek?.getTime() === weekStart.getTime());

    const summary = users.map((u) => {
      const count = checkins.filter((c) => c.userId === u.id).length;
      const ribbonUsed = usedRibbons.some((r) => r.userId === u.id);
      const pardoned = approvedExcuses.some((e) => e.userId === u.id) || isWeekPaused(u.rests, weekStart) || isWeekPaused(pauses, weekStart) || ribbonUsed;
      const shortfall = Math.max(0, REQUIRED_COUNT - count);
      const settlement = settlements.find((s) => s.userId === u.id);
      const rawLab = labFines.get(labFineKey(u.id, weekStart)) ?? noLabFine;
      const lab = pardoned ? noLabFine : rawLab;
      // 식단을 올린 날만 세어 하루 평균을 낸다 (하루는 오전 6시에 바뀐다)
      const dayKcal = new Map<number, number>();
      for (const m of allMeals) {
        if (m.userId !== u.id) continue;
        const day = Math.floor((m.createdAt.getTime() - (weekStart.getTime() + 6 * 60 * 60 * 1000)) / DAY_MS);
        if (day < 0 || day > 6) continue;
        dayKcal.set(day, (dayKcal.get(day) ?? 0) + (m.kcal ?? 0));
      }
      const avgKcal = dayKcal.size
        ? Math.round([...dayKcal.values()].reduce((x, y) => x + y, 0) / dayKcal.size)
        : null;
      return {
        avgKcal,
        userId: u.id,
        name: u.name,
        count,
        pardoned,
        ribbonUsed,
        // 리본이 대신 내준 벌금 (주간 결과 팝업에서 "리본을 써서 면제" 안내용)
        waivedFine: ribbonUsed ? shortfall * FINE_PER_MISS + rawLab.total : 0,
        labFine: lab,
        shortfall,
        fine: pardoned ? 0 : shortfall * FINE_PER_MISS + lab.total,
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
