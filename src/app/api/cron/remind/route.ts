import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToSubscriptions } from "@/lib/push";
import { getWeekStart, getDaysLeftInWeek, REQUIRED_COUNT } from "@/lib/week";

// 외부 스케줄러(Vercel Cron 등)가 매일 저녁 7시(KST) 호출 -> "이제부터 남은 날 매일 해야만 벌금을 피할 수 있는"
// 사람에게만 알림을 보낸다. 예: 이번 주 0회면 금요일부터(남은 날 3일=부족 3회) 매일 알림이 감.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const authorized = secret === process.env.CRON_SECRET || authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const weekStart = getWeekStart();
  const daysLeft = getDaysLeftInWeek();
  const users = await prisma.user.findMany({ include: { subscriptions: true, room: true } });
  const checkins = await prisma.checkin.findMany({ where: { weekStart } });
  const approvedExcuses = await prisma.excuse.findMany({ where: { weekStart, status: "APPROVED" } });
  const now = new Date();

  for (const user of users) {
    // 정지 중인 방이면 알림 스킵
    if (user.room.pausedUntil && user.room.pausedUntil > now) continue;

    // 이미 이번 주 벌금이 사면됐으면 더 이상 조를 필요 없음
    if (approvedExcuses.some((e) => e.userId === user.id)) continue;

    const count = checkins.filter((c) => c.userId === user.id).length;
    const remaining = Math.max(0, REQUIRED_COUNT - count);
    if (remaining === 0) continue;

    // 남은 날 중 하루라도 쉬면 3회를 못 채우는 시점부터만 알림 (그 전엔 아직 여유 있으니 조용히)
    if (remaining < daysLeft) continue;

    const body =
      remaining > daysLeft
        ? `${user.name}님 이번 주 ${count}/${REQUIRED_COUNT}회. 이대로면 벌금이 확정돼요. 사정 봐달라기라도 요청해보세요`
        : `${user.name}님 이번 주 ${count}/${REQUIRED_COUNT}회. 오늘부터 남은 ${daysLeft}일 동안 매일 해야 벌금을 피해요!`;

    await sendPushToSubscriptions(user.subscriptions, {
      title: "인증 마감 임박!",
      body,
    });
  }

  return NextResponse.json({ ok: true });
}
