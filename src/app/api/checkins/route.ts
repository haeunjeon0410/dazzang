import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { labFinesFor, labFineKey, noLabFine, weightTrendsFor } from "@/lib/lab-fine";
import { settleLastWeekLazily } from "@/lib/week-settle";
import { reactionOf } from "@/lib/reactions";
import { createCheckin } from "@/lib/checkin-create";
import { getWeekStart, getWeekDeadline, REQUIRED_COUNT, FINE_PER_MISS, isWeekPaused } from "@/lib/week";

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const weekParam = req.nextUrl.searchParams.get("weekStart");
  const weekStart = weekParam ? new Date(weekParam) : getWeekStart();
  // 날짜가 아닌 값이 오면 DB 오류(500) 대신 잘못된 요청으로 돌려보낸다
  if (Number.isNaN(weekStart.getTime())) return NextResponse.json({ error: "주 날짜가 올바르지 않아요" }, { status: 400 });
  const deadline = getWeekDeadline(weekStart);

  // 이번 주 화면을 열 때 지난 주 리본(획득/사용)을 바로 반영한다. 마감(월요일 오전 6시)이 지나면 9시 정산 작업을 기다리지 않는다.
  // 다른 조회와 같이 돌려서, 리본을 읽기 전까지만 기다린다
  const settling = weekParam ? Promise.resolve() : settleLastWeekLazily(me.roomId);

  const users = await prisma.user.findMany({ where: { roomId: me.roomId }, include: { rests: true } });
  const userIds = users.map((u) => u.id);
  // 서로 상관없는 조회는 한꺼번에 보낸다 (DB가 멀리 있어서 하나씩 기다리면 느리다).
  // 인증 사진 데이터(base64)는 크니까 목록에는 넣지 않고, 사진은 따로 받는다 (/api/checkins/[id]/photo)
  const [checkins, approvedExcuses, pauses] = await Promise.all([
    prisma.checkin.findMany({
      where: { weekStart, userId: { in: userIds } },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, weekStart: true, liked: true, reaction: true, createdAt: true },
    }),
    prisma.excuse.findMany({ where: { weekStart, status: "APPROVED", userId: { in: userIds } } }),
    prisma.roomPause.findMany({ where: { roomId: me.roomId } }),
  ]);
  await settling;
  const ribbons = await prisma.ribbon.findMany({ where: { userId: { in: userIds } } });
  const roomPaused = isWeekPaused(pauses, weekStart);
  // 실험실(식단/몸무게 인증) 벌금: 방 두 사람이 합의한 금액. 친구에게는 몸무게 숫자 없이 벌금만 보인다
  const [labFines, weightTrends] = await Promise.all([labFinesFor(me.roomId, users, [weekStart]), weightTrendsFor(users, weekStart)]);

  // 최근 2주 안에 쓴 리본이 면제한 주의 인증 횟수 (면제된 벌금 금액 계산용)
  const recentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentUsed = ribbons.filter((r) => r.usedWeek && r.usedAt && r.usedAt.getTime() > recentCutoff);
  const usedWeeks = [...new Set(recentUsed.map((r) => r.usedWeek!.getTime()))].map((t) => new Date(t));
  const usedWeekCheckins = usedWeeks.length
    ? await prisma.checkin.findMany({
        where: { userId: { in: userIds }, weekStart: { in: usedWeeks } },
        select: { userId: true, weekStart: true },
      })
    : [];

  const summary = users.map((u) => {
    const mine = checkins.filter((c) => c.userId === u.id);
    // 사정 봐달라하기가 허락되면 인증 1회로 치환되는 게 아니라, 그 주 벌금 자체가 통째로 사면된다
    const ribbonUsed = ribbons.some((r) => r.userId === u.id && r.usedWeek?.getTime() === weekStart.getTime());
    const pardoned =
      approvedExcuses.some((e) => e.userId === u.id) || isWeekPaused(u.rests, weekStart) || roomPaused || ribbonUsed;
    const count = mine.length;
    const shortfall = Math.max(0, REQUIRED_COUNT - count);
    const lab = pardoned ? noLabFine : (labFines.get(labFineKey(u.id, weekStart)) ?? noLabFine);
    return {
      userId: u.id,
      name: u.name,
      count,
      pardoned,
      ribbonUsed,
      ribbons: ribbons.filter((r) => r.userId === u.id && !r.usedWeek).length,
      ribbonIds: ribbons.filter((r) => r.userId === u.id && !r.usedWeek).map((r) => r.id),
      // 최근 2주 안에 받은 리본: 앱을 열었을 때 한 번 훈장이 붙는 연출을 보여주기 위함
      recentEarnedRibbonIds: ribbons
        .filter((r) => r.userId === u.id && r.createdAt.getTime() > Date.now() - 14 * 24 * 60 * 60 * 1000)
        .map((r) => r.id),
      // 최근 2주 안에 쓴 리본: 앱을 열었을 때 한 번 훈장이 떨어지고, 어느 주 벌금을 얼마나 면제했는지 알려주기 위함
      recentUsedRibbons: recentUsed
        .filter((r) => r.userId === u.id)
        .map((r) => {
          const cnt = usedWeekCheckins.filter(
            (c) => c.userId === u.id && c.weekStart.getTime() === r.usedWeek!.getTime(),
          ).length;
          return { id: r.id, usedWeek: r.usedWeek, waivedFine: Math.max(0, REQUIRED_COUNT - cnt) * FINE_PER_MISS };
        }),
      shortfall,
      labFine: lab,
      // 몸무게가 지난 기록보다 늘었는지/줄었는지만 (수치는 없음). 친구에게도 보인다
      weightTrend: weightTrends.get(u.id) ?? null,
      fine: pardoned ? 0 : shortfall * FINE_PER_MISS + lab.total,
      checkins: mine.map((c) => ({ id: c.id, photoUrl: `/api/checkins/${c.id}/photo`, createdAt: c.createdAt, userId: c.userId, liked: c.liked, reaction: reactionOf(c) })),
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

  const result = await createCheckin(userId, photoDataUrl, takenAt);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const checkin = result.checkin;

  return NextResponse.json({ checkin: { id: checkin.id, createdAt: checkin.createdAt } });
}
