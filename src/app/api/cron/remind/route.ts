import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getWeekStart, getDaysLeftInWeek, REQUIRED_COUNT, isWeekPaused } from "@/lib/week";

// 외부 스케줄러(Vercel Cron 등)가 매일 저녁 7시(KST) 호출 -> "이제부터 남은 날 매일 해야만 벌금을 피할 수 있는"
// 사람에게만 알림을 보낸다. 예: 이번 주 0회면 금요일부터(남은 날 3일=부족 3회) 매일 알림이 감.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const weekStart = getWeekStart();
  const daysLeft = getDaysLeftInWeek();
  const users = await prisma.user.findMany({ include: { subscriptions: true, room: true, rests: true } });
  const checkins = await prisma.checkin.findMany({ where: { weekStart } });
  const approvedExcuses = await prisma.excuse.findMany({ where: { weekStart, status: "APPROVED" } });
  const now = new Date();
  const pushes: Promise<unknown>[] = [];

  for (const user of users) {
    // 정지 중인 방이면 알림 스킵
    if (user.room.pausedUntil && user.room.pausedUntil > now) continue;

    // 친구가 거절해서 혼자 쉬는 중인 사람은 벌금이 없으니 알림도 스킵
    if (isWeekPaused(user.rests, weekStart)) continue;

    // 이미 이번 주 벌금이 사면됐으면 더 이상 조를 필요 없음
    if (approvedExcuses.some((e) => e.userId === user.id)) continue;

    const count = checkins.filter((c) => c.userId === user.id).length;
    const remaining = Math.max(0, REQUIRED_COUNT - count);
    if (remaining === 0) continue;

    // 남은 날 중 하루라도 쉬면 3회를 못 채우는 시점부터만 알림 (그 전엔 아직 여유 있으니 조용히)
    if (remaining < daysLeft) continue;

    const body =
      remaining > daysLeft
        ? `${user.name}님 이번 주 ${count}/${REQUIRED_COUNT}회. 이대로면 벌금이 확정돼요. 사정 봐달라하기라도 요청해보세요`
        : `${user.name}님 이번 주 ${count}/${REQUIRED_COUNT}회. 오늘부터 남은 ${daysLeft}일 동안 매일 해야 벌금을 피해요!`;

    pushes.push(
      sendPushToUser(user, {
        title: "인증 마감 임박!",
        body,
      }),
    );
  }

  // 몸무게 인증: 마감 전날(일요일) 저녁에, 이번 주 몸무게 인증을 안 한 사람에게 알린다. 벌금 약속이 있으면 자동 청구도 알려준다
  if (daysLeft === 1) {
    const weightRules = await prisma.labFineRule.findMany({ where: { feature: "weight", amount: { gt: 0 } } });
    const weightLogs = await prisma.weightLog.findMany({ where: { weekStart }, select: { userId: true } });
    for (const user of users) {
      if (!user.labWeight) continue;
      if (user.room.pausedUntil && user.room.pausedUntil > now) continue;
      if (isWeekPaused(user.rests, weekStart)) continue;
      if (approvedExcuses.some((e) => e.userId === user.id)) continue;
      if (weightLogs.some((l) => l.userId === user.id)) continue;
      const rule = weightRules.find((r) => r.roomId === user.roomId && r.sinceWeek && r.sinceWeek <= weekStart);
      pushes.push(
        sendPushToUser(user, {
          title: "몸무게 인증 마감 임박!",
          body: rule
            ? `${user.name}님 이번 주 몸무게 인증을 아직 안 했어요. 오늘 안에 안 하면 벌금 ${rule.amount.toLocaleString()}원이 자동으로 청구돼요`
            : `${user.name}님 이번 주 몸무게 인증을 아직 안 했어요. 오늘 안에 인증해 주세요`,
        }),
      );
    }
  }
  await Promise.allSettled(pushes);

  return NextResponse.json({ ok: true });
}
