import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendPushToUser } from "@/lib/push";
import { getWeekStart, isWeekPaused } from "@/lib/week";
import { isDue, kstNow } from "@/lib/meal-reminder";

const KINDS = [
  { kind: "lunch" as const, title: "점심시간이에요", body: "먹기 전에 식단 한 장 올려 볼까요?" },
  { kind: "dinner" as const, title: "저녁시간이에요", body: "먹기 전에 식단 한 장 올려 볼까요?" },
];

// 식사 알림. Vercel 무료 크론은 하루 한 번뿐이라 외부 스케줄러(cron-job.org)가 15분마다 이 주소를 부른다 (docs/meal-reminder.md).
// 사용자가 정한 점심/저녁 시간이 막 지난 사람에게만, 하루에 한 번씩 푸시를 보낸다.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const { day, minutes } = kstNow(now);
  const weekStart = getWeekStart(now);
  const users = await prisma.user.findMany({
    where: { mealReminder: true, labMeal: true },
    include: { room: true, rests: true },
  });

  const sent: string[] = [];
  // 같은 사람의 계정이 방마다 있으면(linkGroup) 알림이 겹치지 않게 한 번만 보낸다
  const seen = new Set<string>();
  for (const user of users) {
    // 쉬어가는 중이면 조용히
    if (user.room.pausedUntil && user.room.pausedUntil > now) continue;
    if (isWeekPaused(user.rests, weekStart)) continue;

    for (const k of KINDS) {
      const time = k.kind === "lunch" ? user.lunchTime : user.dinnerTime;
      if (!isDue(minutes, time)) continue;
      const dedupe = `${user.linkGroup ?? user.id}:${k.kind}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      // 이미 식단을 올렸으면 알림이 필요 없다
      const posted = await prisma.meal.count({ where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 90 * 60 * 1000) } } });
      if (posted > 0) continue;

      // 같은 날 같은 알림은 한 번만 (먼저 기록하는 쪽이 보낸다)
      try {
        await prisma.mealReminderSent.create({ data: { userId: user.id, day, kind: k.kind } });
      } catch {
        continue;
      }
      await sendPushToUser(user, { title: k.title, body: k.body }).catch(() => {});
      sent.push(`${user.name}:${k.kind}`);
    }
  }
  return NextResponse.json({ ok: true, sent });
}
