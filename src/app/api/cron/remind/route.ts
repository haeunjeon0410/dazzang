import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToSubscriptions } from "@/lib/push";
import { getWeekStart, REQUIRED_COUNT } from "@/lib/week";

// 외부 스케줄러(Vercel Cron 등)가 매주 토요일 저녁에 호출 -> 이번 주 부족 인원에게 리마인드
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const authorized = secret === process.env.CRON_SECRET || authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const weekStart = getWeekStart();
  const users = await prisma.user.findMany({ include: { subscriptions: true } });
  const checkins = await prisma.checkin.findMany({ where: { weekStart } });

  for (const user of users) {
    const count = checkins.filter((c) => c.userId === user.id).length;
    const remaining = Math.max(0, REQUIRED_COUNT - count);
    if (remaining === 0) continue;

    await sendPushToSubscriptions(user.subscriptions, {
      title: "인증 마감 임박!",
      body: `${user.name}님 이번 주 ${count}/${REQUIRED_COUNT}회. ${remaining}회 더 안 하면 벌금이에요 (일요일 밤 12시 마감)`,
    });
  }

  return NextResponse.json({ ok: true });
}
