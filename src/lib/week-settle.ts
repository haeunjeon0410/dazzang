// 지난 주 정산 중 "리본" 부분 (획득 + 사용). 주 마감(월요일 오전 6시)이 지나면 바로 반영되게,
// 월요일 오전 9시 정산 작업(finalize)과 앱을 열 때(settleLastWeekLazily) 양쪽에서 같은 코드를 쓴다.
// 두 번 돌려도 같은 결과가 나오게 만들어져 있다 (리본은 사람·주마다 하나, 이미 쓴 주는 다시 쓰지 않는다).
import type { Checkin, Excuse, PushSubscription, User, UserRest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { labFinesFor, labFineKey, type LabFine } from "@/lib/lab-fine";
import { getWeekStart, getWeekDeadline, REQUIRED_COUNT, FINE_PER_MISS, isWeekPaused } from "@/lib/week";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type SettleUser = User & { rests: UserRest[]; subscriptions: PushSubscription[] };
export type SettleResult = {
  user: SettleUser;
  count: number;
  pardoned: boolean;
  excused: boolean;
  ribbonUsed: boolean;
  shortfall: number;
  fine: number;
};

// 한 방의 지난 주 결과를 계산하고, 리본을 주고(친구가 쉬는 주에 목표를 채운 사람), 벌금이 생긴 사람은 리본으로 면제한다.
// notify가 true면(9시 정산 작업) 새로 받은 리본 알림을 보낸다
export async function settleRoomWeek(
  roomId: string,
  users: SettleUser[],
  checkins: Pick<Checkin, "userId">[],
  approvedExcuses: Pick<Excuse, "userId">[],
  lastWeekStart: Date,
  notify: boolean,
): Promise<{ results: SettleResult[]; labFines: Map<string, LabFine> }> {
  const labFines = await labFinesFor(roomId, users, [lastWeekStart]);

  const results: SettleResult[] = users.map((u) => {
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
      fine: pardoned ? 0 : shortfall * FINE_PER_MISS + (labFines.get(labFineKey(u.id, lastWeekStart))?.total ?? 0),
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
      await prisma.ribbon.createMany({
        data: [{ userId: r.user.id, weekStart: lastWeekStart }],
        skipDuplicates: true,
      });
      if (notify) {
        // 앱을 열 때 이미 만들어진 리본이어도 9시 정산 때 한 번 알려준다 (최근 하루 안에 만들어진 것만)
        const ribbon = await prisma.ribbon.findUnique({
          where: { userId_weekStart: { userId: r.user.id, weekStart: lastWeekStart } },
        });
        if (ribbon && Date.now() - ribbon.createdAt.getTime() < 24 * 60 * 60 * 1000) {
          await sendPushToUser(r.user, {
            title: "리본 획득!",
            icon: "/assets/ribbon.webp",
            body: "친구가 쉬는 동안에도 목표를 채웠어요. 벌금이 생기는 주에 리본이 자동으로 면제해줘요",
          });
        }
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

  return { results, labFines };
}

// 앱을 열 때 지난 주 리본을 바로 반영한다 (마감 오전 6시가 지났으면 9시 정산 작업을 기다리지 않는다).
// 인스턴스마다 방·주당 한 번만 돌리고, 실패해도 화면은 그대로 뜬다
const settled = new Set<string>();

export async function settleLastWeekLazily(roomId: string): Promise<void> {
  try {
    const lastWeekStart = new Date(getWeekStart().getTime() - WEEK_MS);
    const key = `${roomId}:${lastWeekStart.getTime()}`;
    if (settled.has(key)) return;

    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { pauses: true, users: { include: { subscriptions: true, rests: true } } },
    });
    if (!room) return;
    // 방이 생기기 전 주, 방 전체가 쉬는 주는 정산하지 않는다 (9시 정산 작업과 같은 규칙)
    const skip =
      getWeekDeadline(lastWeekStart).getTime() <= room.createdAt.getTime() ||
      (room.pausedUntil && room.pausedUntil > lastWeekStart) ||
      isWeekPaused(room.pauses, lastWeekStart);
    if (!skip) {
      const ids = room.users.map((u) => u.id);
      const [checkins, excuses] = await Promise.all([
        prisma.checkin.findMany({ where: { weekStart: lastWeekStart, userId: { in: ids } }, select: { userId: true } }),
        prisma.excuse.findMany({ where: { weekStart: lastWeekStart, status: "APPROVED", userId: { in: ids } }, select: { userId: true } }),
      ]);
      await settleRoomWeek(room.id, room.users, checkins, excuses, lastWeekStart, false);
    }
    settled.add(key);
  } catch (e) {
    console.error("[settle] lazy", e instanceof Error ? e.message : e);
  }
}
