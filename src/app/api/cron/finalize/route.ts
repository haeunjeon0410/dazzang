import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToSubscriptions } from "@/lib/push";
import { getWeekStart, REQUIRED_COUNT, FINE_PER_MISS } from "@/lib/week";

// 외부 스케줄러가 매주 월요일 06:05 KST(마감 직후)에 호출 -> 지난 주 결과를 양쪽에 확정 통보
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

  for (const room of rooms) {
    // 지난 주가 정지 기간에 포함되면 마감 스킵
    if (room.pausedUntil && room.pausedUntil > lastWeekStart) continue;

    const results = room.users.map((u) => {
      const count = checkins.filter((c) => c.userId === u.id).length;
      const pardoned = approvedExcuses.some((e) => e.userId === u.id);
      const shortfall = Math.max(0, REQUIRED_COUNT - count);
      return { user: u, count, pardoned, shortfall, fine: pardoned ? 0 : shortfall * FINE_PER_MISS };
    });

    const body = results
      .map((r) => {
        const pardonNote = r.pardoned && r.count < REQUIRED_COUNT ? " (사정 봐달라기로 벌금 사면)" : "";
        return `${r.user.name}: ${r.count}/${REQUIRED_COUNT}회${pardonNote}, 벌금 ${r.fine.toLocaleString()}원`;
      })
      .join(" / ");

    for (const r of results) {
      await sendPushToSubscriptions(r.user.subscriptions, {
        title: "지난 주 인증 결과 확정",
        body,
      });
      allResults.push({ name: r.user.name, count: r.count, fine: r.fine });
    }
  }

  return NextResponse.json({ ok: true, results: allResults });
}
