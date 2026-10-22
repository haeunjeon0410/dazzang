// 실험실 벌금 계산 (몸무게 인증, 식단 인증).
// - 식단 인증: 하루(오전 6시 기준)에 식단을 하나도 안 올리면 그날 금액 1회. 이미 끝난 날만 센다 (오늘은 아직 올릴 수 있다)
// 몸무게 인증 벌금 규칙: 방 두 사람이 합의한 금액(LabFineRule)을 주 단위로 적용한다.
// - 그 주 몸무게 인증을 안 했거나, 바로 전 기록보다 늘었으면 금액 1회 (인증은 했는데 비교할 전 기록이 없으면 없음)
// - 몸무게 인증을 켠 사람에게만 적용되고, 합의한 다음 주(sinceWeek)부터 적용되어 지난 주는 소급하지 않는다.
// - 쉬는 주/사정 봐주기/리본으로 면제되는 것은 부르는 쪽에서 운동 벌금과 똑같이 처리한다.
import { prisma } from "@/lib/prisma";

export const LAB_FEATURES = ["weight", "meal"] as const;
export type LabFeature = (typeof LAB_FEATURES)[number];

// 제안할 수 있는 금액 (0 = 벌금 없음)
export const FINE_CHOICES = [0, 5000, 10000, 15000, 20000, 25000, 30000];
// 기능마다 제안할 수 있는 금액이 다르다. 식단은 하루 단위라 금액이 작다 (하루에 안 올릴 때마다 한 번)
export const FINE_CHOICES_BY: Record<LabFeature, number[]> = {
  weight: FINE_CHOICES,
  meal: [0, 1000, 2000, 3000, 4000, 5000],
};

export type LabUser = { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;
// 하루와 한 주는 오전 6시에 바뀐다 (lib/week.ts와 같다)
const RESET_MS = 6 * 60 * 60 * 1000;

// 그 주에 적용되는 벌금 금액. 금액을 바꿨으면 새 금액이 시작되는 주부터 새 금액, 그 전 주들은 이전 금액이다
export function fineAmountForWeek(
  rule: { amount: number; sinceWeek: Date | null; prevAmount: number | null; prevSinceWeek: Date | null },
  weekStart: Date,
): number {
  const t = weekStart.getTime();
  if (rule.sinceWeek && t >= rule.sinceWeek.getTime()) return rule.amount;
  if (rule.prevSinceWeek && rule.prevAmount && t >= rule.prevSinceWeek.getTime()) return rule.prevAmount;
  return 0;
}
export type LabFine = { weight: number; meal: number; total: number };

export const noLabFine: LabFine = { weight: 0, meal: 0, total: 0 };

export function labFineKey(userId: string, weekStart: Date): string {
  return `${userId}|${weekStart.getTime()}`;
}

// 여러 주의 사람별 실험실 벌금. 키는 labFineKey(userId, 주 시작)
export async function labFinesFor(
  roomId: string,
  users: LabUser[],
  weekStarts: Date[],
): Promise<Map<string, LabFine>> {
  const out = new Map<string, LabFine>();
  if (weekStarts.length === 0) return out;
  // 친구와 같이 하는 기능이라 두 사람이 모두 있는 방에서만 벌금이 있다
  if (users.length < 2) return out;

  const rules = await prisma.labFineRule.findMany({ where: { roomId } });
  const started = (feature: LabFeature) => {
    const r = rules.find((x) => x.feature === feature);
    return r && (r.sinceWeek || r.prevSinceWeek) ? r : null;
  };
  const weightRule = started("weight");
  const mealRule = started("meal");
  if (!weightRule && !mealRule) return out;

  const ids = users.map((u) => u.id);
  const times = weekStarts.map((w) => w.getTime());
  const maxWeek = Math.max(...times);
  const minWeek = Math.min(...times);
  const add = (id: string, w: Date, part: "weight" | "meal", amount: number) => {
    const key = labFineKey(id, w);
    const cur = out.get(key) ?? { weight: 0, meal: 0, total: 0 };
    cur[part] += amount;
    cur.total += amount;
    out.set(key, cur);
  };

  const [logs, meals] = await Promise.all([
    weightRule
      ? prisma.weightLog.findMany({
          where: { userId: { in: ids }, weekStart: { lte: new Date(maxWeek) } },
          orderBy: { weekStart: "asc" },
          select: { userId: true, weekStart: true, kg: true },
        })
      : Promise.resolve([]),
    mealRule
      ? prisma.meal.findMany({
          where: { userId: { in: ids }, confirmed: true, createdAt: { gte: new Date(minWeek + RESET_MS), lt: new Date(maxWeek + 7 * DAY_MS + RESET_MS) } },
          select: { userId: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const now = Date.now();
  for (const w of weekStarts) {
    if (weightRule) {
      const amount = fineAmountForWeek(weightRule, w);
      if (amount > 0) {
        for (const id of ids) {
          const mine = logs.filter((l) => l.userId === id && l.weekStart.getTime() <= w.getTime());
          const cur = mine.find((l) => l.weekStart.getTime() === w.getTime());
          // 그 주에 인증을 안 하면 자동으로 벌금
          if (!cur) {
            add(id, w, "weight", amount);
            continue;
          }
          const prev = [...mine].reverse().find((l) => l.weekStart.getTime() < w.getTime());
          if (prev && cur.kg > prev.kg) add(id, w, "weight", amount);
        }
      }
    }
    if (mealRule) {
      const amount = fineAmountForWeek(mealRule, w);
      if (amount > 0) {
        for (const id of ids) {
          const mine = meals.filter((m) => m.userId === id).map((m) => m.createdAt.getTime());
          let missed = 0;
          for (let d = 0; d < 7; d++) {
            const from = w.getTime() + RESET_MS + d * DAY_MS;
            const to = from + DAY_MS;
            if (to > now) break; // 아직 안 끝난 날은 세지 않는다
            if (!mine.some((t) => t >= from && t < to)) missed++;
          }
          if (missed > 0) add(id, w, "meal", missed * amount);
        }
      }
    }
  }
  return out;
}

export type WeightTrend = "up" | "down" | "same";

// 방 친구에게도 보이는 몸무게 변화 방향 (수치는 내려보내지 않는다). 이번 주 기록과 바로 전 기록을 비교한다.
// 몸무게 인증을 켠 사람만, 이번 주 기록과 비교할 전 기록이 모두 있을 때만 값이 있다
export async function weightTrendsFor(users: LabUser[], weekStart: Date): Promise<Map<string, WeightTrend>> {
  const out = new Map<string, WeightTrend>();
  if (users.length < 2) return out;
  const ids = users.map((u) => u.id);
  const logs = await prisma.weightLog.findMany({
    where: { userId: { in: ids }, weekStart: { lte: weekStart } },
    orderBy: { weekStart: "desc" },
    select: { userId: true, weekStart: true, kg: true },
  });
  for (const id of ids) {
    const mine = logs.filter((l) => l.userId === id);
    const cur = mine[0];
    const prev = mine[1];
    if (!cur || !prev || cur.weekStart.getTime() !== weekStart.getTime()) continue;
    out.set(id, cur.kg > prev.kg ? "up" : cur.kg < prev.kg ? "down" : "same");
  }
  return out;
}
