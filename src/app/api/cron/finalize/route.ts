import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getWeekStart, formatResumeDate, REQUIRED_COUNT, FINE_PER_MISS, isWeekPaused } from "@/lib/week";

// 외부 스케줄러가 매주 월요일 09:00 KST에 호출 -> 지난 주 결과를 양쪽에 확정 통보
// (마감은 월요일 06:00이지만, 새벽 알림으로 잠 깨우지 않도록 아침 9시에 보낸다)
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const lastWeekStart = new Date(getWeekStart().getTime() - 7 * 24 * 60 * 60 * 1000);
  const rooms = await prisma.room.findMany({ include: { pauses: true, users: { include: { subscriptions: true, rests: true } } } });
  const checkins = await prisma.checkin.findMany({ where: { weekStart: lastWeekStart } });
  const approvedExcuses = await prisma.excuse.findMany({ where: { weekStart: lastWeekStart, status: "APPROVED" } });

  const allResults: { name: string; count: number; fine: number }[] = [];

  const thisWeekStart = getWeekStart();

  for (const room of rooms) {
    // 쉬어가기가 끝나 이번 주부터 다시 시작하는 방 -> 안내 알림 보내고 정지 상태 정리
    // (마감 스킵 판단은 아래에서 정리 전 값 room.pausedUntil로 그대로 한다)
    if (room.pausedUntil && room.pausedUntil <= thisWeekStart) {
      if (room.pausedUntil.getTime() === thisWeekStart.getTime()) {
        await Promise.allSettled(
          room.users.map((u) =>
            sendPushToUser(u, {
              title: "쉬어가기 끝! 다시 시작해요",
              icon: "/assets/sleep-icon-192.png",
              body: `이번 주(${formatResumeDate(thisWeekStart)})부터 다시 시작! 이번 주 ${REQUIRED_COUNT}회 인증 가보자고요`,
            }),
          ),
        );
      }
      await prisma.room.update({ where: { id: room.id }, data: { pausedUntil: null, pauseReason: null } });
    }

    // 지난 주가 정지 기간에 포함되면 마감 스킵
    if ((room.pausedUntil && room.pausedUntil > lastWeekStart) || isWeekPaused(room.pauses, lastWeekStart)) continue;

    const results = room.users.map((u) => {
      const count = checkins.filter((c) => c.userId === u.id).length;
      const excused = approvedExcuses.some((e) => e.userId === u.id);
      const resting = isWeekPaused(u.rests, lastWeekStart);
      const pardoned = excused || resting;
      const shortfall = Math.max(0, REQUIRED_COUNT - count);
      return {
        user: u,
        count,
        pardoned,
        excused,
        ribbonUsed: false,
        shortfall,
        fine: pardoned ? 0 : shortfall * FINE_PER_MISS,
      };
    });

    // 리본 획득: 친구가 쉬는 주(혼자 쉬기를 거절당했거나, 사정 봐달라하기가 허락된 주)에
    // 나는 쉬지 않고 목표(3회)를 채웠으면 리본 1개
    for (const r of results) {
      const friendResting = results.some(
        (o) => o.user.id !== r.user.id && (o.excused || isWeekPaused(o.user.rests, lastWeekStart)),
      );
      const meResting = r.excused || isWeekPaused(r.user.rests, lastWeekStart);
      if (r.count >= REQUIRED_COUNT && friendResting && !meResting) {
        const created = await prisma.ribbon.createMany({
          data: [{ userId: r.user.id, weekStart: lastWeekStart }],
          skipDuplicates: true,
        });
        if (created.count > 0) {
          await sendPushToUser(r.user, {
            title: "리본 획득!",
            icon: "/assets/ribbon.webp",
            body: "친구가 쉬는 동안에도 목표를 채웠어요. 벌금이 생기는 주에 리본이 자동으로 면제해줘요",
          });
        }
      }
    }

    // 리본 사용: 벌금이 생긴 사람은 가장 오래된 리본 1개로 그 주 벌금을 면제
    for (const r of results) {
      if (r.fine <= 0) continue;
      // 이미 이 주에 리본을 써서 면제한 사람이면(정산을 다시 돌린 경우) 새로 쓰지 않고 면제 상태만 반영
      const alreadyUsed = await prisma.ribbon.findFirst({ where: { userId: r.user.id, usedWeek: lastWeekStart } });
      if (alreadyUsed) {
        r.pardoned = true;
        r.ribbonUsed = true;
        r.fine = 0;
        continue;
      }
      const ribbon = await prisma.ribbon.findFirst({
        where: { userId: r.user.id, usedWeek: null },
        orderBy: { weekStart: "asc" },
      });
      if (!ribbon) continue;
      const used = await prisma.ribbon.updateMany({
        where: { id: ribbon.id, usedWeek: null },
        data: { usedWeek: lastWeekStart, usedAt: new Date() },
      });
      if (used.count > 0) {
        r.pardoned = true;
        r.ribbonUsed = true;
        r.fine = 0;
      }
    }

    const body = results
      .map((r) => {
        const pardonNote =
          r.pardoned && r.count < REQUIRED_COUNT
            ? r.ribbonUsed
              ? " (리본 사용으로 벌금 면제)"
              : r.excused
                ? " (사정 봐달라하기로 벌금 사면)"
                : " (쉬는 기간이라 벌금 없음)"
            : "";
        return `${r.user.name}: ${r.count}/${REQUIRED_COUNT}회${pardonNote}, 벌금 ${r.fine.toLocaleString()}원`;
      })
      .join(" / ");

    for (const r of results) allResults.push({ name: r.user.name, count: r.count, fine: r.fine });

    // 모두 목표를 채웠으면 알릴 게 없으니 결과 알림은 생략
    if (results.every((r) => r.count >= REQUIRED_COUNT)) continue;

    await Promise.allSettled(
      results.map((r) =>
        sendPushToUser(r.user, {
          title: "지난 주 인증 결과 확정",
          body,
        }),
      ),
    );
  }

  return NextResponse.json({ ok: true, results: allResults });
}
