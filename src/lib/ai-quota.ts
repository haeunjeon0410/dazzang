import { prisma } from "@/lib/prisma";

// 사람마다 하루(오전 6시 기준)에 AI를 부를 수 있는 횟수. 한 사람이 크레딧을 너무 많이 쓰지 않게 한다.
// 환경변수 AI_PHOTO_LIMIT / AI_TEXT_LIMIT 로 바꿀 수 있다
export const AI_DAILY_LIMIT = {
  photo: Number(process.env.AI_PHOTO_LIMIT) || 12,
  text: Number(process.env.AI_TEXT_LIMIT) || 30,
} as const;

function quotaDay(now = Date.now()): string {
  // KST(+9) 오전 6시에 하루가 바뀌므로 15시간을 더해 날짜만 읽는다
  return new Date(now + 15 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 한 번 쓸 몫을 가져간다. 한도를 넘으면 false (이때도 횟수는 올라가지만 AI는 부르지 않는다)
export async function takeAiQuota(userId: string, kind: keyof typeof AI_DAILY_LIMIT): Promise<boolean> {
  const row = await prisma.aiUsage.upsert({
    where: { userId_day_kind: { userId, day: quotaDay(), kind } },
    create: { userId, day: quotaDay(), kind, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count <= AI_DAILY_LIMIT[kind];
}
