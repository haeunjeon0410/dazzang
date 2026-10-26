import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { fineAmountForWeek } from "@/lib/lab-fine";
import { getWeekStart, getDayRange, isWeekPaused } from "@/lib/week";

// 외부 스케줄러(Vercel Cron)가 매일 오후 6시(KST)에 호출 -> 오늘(오전 6시 기준 하루) 식단 인증을 아직 안 한 사람에게 알린다.
// 식단 벌금 약속이 있으면 오늘을 넘기면 그날 벌금이 쌓인다고 같이 알려준다.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekStart = getWeekStart(now);
  const { start, end } = getDayRange(now);
  const users = await prisma.user.findMany({ include: { room: true, rests: true } });
  const [meals, rules, excuses] = await Promise.all([
    prisma.meal.findMany({ where: { confirmed: true, createdAt: { gte: start, lte: end } }, select: { userId: true } }),
    prisma.labFineRule.findMany({ where: { feature: "meal" } }),
    prisma.excuse.findMany({ where: { weekStart, status: "APPROVED" }, select: { userId: true } }),
  ]);

  const pushes: Promise<unknown>[] = [];
  for (const user of users) {
    // 쉬어가는 방, 혼자 쉬는 사람, 이번 주 사정을 봐준 사람은 알리지 않는다
    if (user.room.pausedUntil && user.room.pausedUntil > now) continue;
    if (isWeekPaused(user.rests, weekStart)) continue;
    if (excuses.some((e) => e.userId === user.id)) continue;
    if (meals.some((m) => m.userId === user.id)) continue;

    // 벌금이 꺼져 있으면(약속이 없거나 0원) 안 해도 잃는 게 없으니 알리지 않는다
    const rule = rules.find((r) => r.roomId === user.roomId);
    const fine = rule ? fineAmountForWeek(rule, weekStart) : 0;
    if (fine <= 0) continue;
    pushes.push(
      sendPushToUser(user, {
        title: "오늘 식단 인증 아직이에요",
        body: `${user.name}님 오늘 식단 인증을 아직 안 했어요. 오늘을 넘기면 벌금 ${fine.toLocaleString()}원이 쌓여요`,
      }),
    );
  }
  await Promise.allSettled(pushes);

  return NextResponse.json({ ok: true, notified: pushes.length });
}
