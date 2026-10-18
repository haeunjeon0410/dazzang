import { prisma } from "@/lib/prisma";

// 사람마다 하루(오전 6시 기준)에 AI를 부를 수 있는 횟수. 한 사람이 크레딧을 너무 많이 쓰지 않게 한다.
// 환경변수 AI_PHOTO_LIMIT / AI_TEXT_LIMIT 로 바꿀 수 있다
export const AI_DAILY_LIMIT = {
  photo: Number(process.env.AI_PHOTO_LIMIT) || 12,
  text: Number(process.env.AI_TEXT_LIMIT) || 30,
} as const;

// 앱 전체가 한 달에 쓸 수 있는 크레딧. 환경변수 AI_MONTHLY_CREDITS 로 바꿀 수 있다
export const AI_MONTHLY_CREDITS = Number(process.env.AI_MONTHLY_CREDITS) || 300;

// GPT-6 Luna 단가 (크레딧 / 1K 토큰, 2026-10-14 기준). 바뀌면 여기를 고친다
const INPUT_PER_1K = 0.1;
const OUTPUT_PER_1K = 0.5;

function quotaDay(now = Date.now()): string {
  // KST(+9) 오전 6시에 하루가 바뀌므로 15시간을 더해 날짜만 읽는다
  return new Date(now + 15 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function budgetMonth(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export type QuotaResult = "ok" | "daily" | "monthly";

// 한 번 쓸 몫을 가져간다. 이번 달 앱 전체 한도나 오늘 내 한도를 넘으면 AI를 부르지 않는다
// (한도를 넘은 시도도 횟수는 올라간다)
export async function takeAiQuota(userId: string, kind: keyof typeof AI_DAILY_LIMIT): Promise<QuotaResult> {
  const budget = await prisma.aiBudget.findUnique({ where: { month: budgetMonth() } });
  if ((budget?.credits ?? 0) >= AI_MONTHLY_CREDITS) return "monthly";
  const row = await prisma.aiUsage.upsert({
    where: { userId_day_kind: { userId, day: quotaDay(), kind } },
    create: { userId, day: quotaDay(), kind, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count <= AI_DAILY_LIMIT[kind] ? "ok" : "daily";
}

// AI 호출이 끝나면 쓴 토큰을 크레딧으로 바꿔 이번 달 합계에 더한다. 실패해도 식단 올리기를 막지 않는다
export async function addCredits(inputTokens: unknown, outputTokens: unknown): Promise<void> {
  const i = typeof inputTokens === "number" ? inputTokens : 0;
  const o = typeof outputTokens === "number" ? outputTokens : 0;
  const credits = (i / 1000) * INPUT_PER_1K + (o / 1000) * OUTPUT_PER_1K;
  if (credits <= 0) return;
  try {
    const month = budgetMonth();
    await prisma.aiBudget.upsert({
      where: { month },
      create: { month, credits },
      update: { credits: { increment: credits } },
    });
  } catch (e) {
    console.error("[meal] credits", e instanceof Error ? e.message : e);
  }
}

// 한도에 걸렸을 때 사용자에게 보여줄 문구
export const quotaMessage = (r: Exclude<QuotaResult, "ok">) =>
  r === "monthly" ? "이번 달 AI 분석을 다 썼어요" : "오늘 AI 분석을 다 썼어요";
