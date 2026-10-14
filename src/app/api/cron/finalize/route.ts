import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getWeekStart, formatResumeDate, REQUIRED_COUNT, FINE_PER_MISS, isUserResting } from "@/lib/week";

// 외부 스케줄러가 매주 월요일 09:00 KST에 호출 -> 지난 주 결과를 양쪽에 확정 통보
// (마감은 월요일 06:00이지만, 새벽 알림으로 잠 깨우지 않도록 아침 9시에 보낸다)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const authorized = secret === process.env.CRON_SECRET || authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const lastWeekStart = new Date(getWeekStart().getTime() - 7 * 24 * 60 * 60 * 1000);
  const rooms = await prisma.room.findMany({ include: { users: { include: { subscriptions: true } } } });
  const checkins = await prisma.checkin.findMany({ where: { weekStart: lastWeekStart } });
  const approvedExcuses = await prisma.excuse.findMany({ where: { weekStart: lastWeekStart, status: "APPROVED" } });

  const allResults: { name: string; count: number; fine: number }[] = [];

  const thisWeekStart = getWeekStart();

  for (const room of rooms) {
    // 쉬어가기가 끝나 이번 주부터 다시 시작하는 방 -> 안내 알림 보내고 정지 상태 정리
    // (마감 스킵 판단은 아래에서 정리 전 값 room.pausedUntil로 그대로 한다)
    if (room.pausedUntil && room.pausedUntil <= thisWeekStart) {
      if (room.pausedUntil.getTime() === thisWeekStart.getTime()) {
        for (const u of room.users) {
          await sendPushToUser(u, {
            title: "쉬어가기 끝! 다시 시작해요",
            body: `이번 주(${formatResumeDate(thisWeekStart)})부터 다시 시작! 이번 주 ${REQUIRED_COUNT}회 인증 가보자고요`,
          });
        }
      }
      await prisma.room.update({ where: { id: room.id }, data: { pausedUntil: null, pauseReason: null } });
    }

    // 지난 주가 정지 기간에 포함되면 마감 스킵
    if (room.pausedUntil && room.pausedUntil > lastWeekStart) continue;

    const results = room.users.map((u) => {
      const count = checkins.filter((c) => c.userId === u.id).length;
      const excused = approvedExcuses.some((e) => e.userId === u.id);
      const resting = isUserResting(u, lastWeekStart);
      const pardoned = excused || resting;
      const shortfall = Math.max(0, REQUIRED_COUNT - count);
      return { user: u, count, pardoned, excused, shortfall, fine: pardoned ? 0 : shortfall * FINE_PER_MISS };
    });

    const body = results
      .map((r) => {
        const pardonNote =
          r.pardoned && r.count < REQUIRED_COUNT
            ? r.excused
              ? " (사정 봐달라하기로 벌금 사면)"
              : " (쉬는 기간이라 벌금 없음)"
            : "";
        return `${r.user.name}: ${r.count}/${REQUIRED_COUNT}회${pardonNote}, 벌금 ${r.fine.toLocaleString()}원`;
      })
      .join(" / ");

    for (const r of results) allResults.push({ name: r.user.name, count: r.count, fine: r.fine });

    // 모두 목표를 채웠으면 알릴 게 없으니 결과 알림은 생략
    if (results.every((r) => r.count >= REQUIRED_COUNT)) continue;

    for (const r of results) {
      await sendPushToUser(r.user, {
        title: "지난 주 인증 결과 확정",
        body,
      });
    }
  }

  return NextResponse.json({ ok: true, results: allResults });
}
