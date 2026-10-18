// 실험실 몸무게 인증 벌금 계산. 방 두 사람이 합의한 금액(LabFineRule)을 주 단위로 적용한다.
// - 그 주 몸무게 인증을 안 했거나, 바로 전 기록보다 늘었으면 금액 1회 (인증은 했는데 비교할 전 기록이 없으면 없음)
// - 몸무게 인증을 켠 사람에게만 적용되고, 합의한 다음 주(sinceWeek)부터 적용되어 지난 주는 소급하지 않는다.
// - 쉬는 주/사정 봐주기/리본으로 면제되는 것은 부르는 쪽에서 운동 벌금과 똑같이 처리한다.
import { prisma } from "@/lib/prisma";

export const LAB_FEATURES = ["weight"] as const;
export type LabFeature = (typeof LAB_FEATURES)[number];

// 제안할 수 있는 금액 (0 = 벌금 없음)
export const FINE_CHOICES = [0, 5000, 10000, 15000, 20000, 25000, 30000];

export type LabUser = { id: string };
export type LabFine = { weight: number; total: number };

export const noLabFine: LabFine = { weight: 0, total: 0 };

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

  const rule = await prisma.labFineRule.findUnique({ where: { roomId_feature: { roomId, feature: "weight" } } });
  if (!rule || rule.amount <= 0 || !rule.sinceWeek) return out;
  const since = rule.sinceWeek.getTime();

  // 친구와 같이 하는 기능이라 두 사람이 모두 있는 방에서만 벌금이 있다
  if (users.length < 2) return out;
  const ids = users.map((u) => u.id);
  const maxWeek = Math.max(...weekStarts.map((w) => w.getTime()));
  const logs = await prisma.weightLog.findMany({
    where: { userId: { in: ids }, weekStart: { lte: new Date(maxWeek) } },
    orderBy: { weekStart: "asc" },
    select: { userId: true, weekStart: true, kg: true },
  });

  for (const w of weekStarts) {
    if (w.getTime() < since) continue;
    for (const id of ids) {
      const mine = logs.filter((l) => l.userId === id && l.weekStart.getTime() <= w.getTime());
      const cur = mine.find((l) => l.weekStart.getTime() === w.getTime());
      // 그 주에 인증을 안 하면 자동으로 벌금
      if (!cur) {
        out.set(labFineKey(id, w), { weight: rule.amount, total: rule.amount });
        continue;
      }
      const prev = [...mine].reverse().find((l) => l.weekStart.getTime() < w.getTime());
      if (prev && cur.kg > prev.kg) out.set(labFineKey(id, w), { weight: rule.amount, total: rule.amount });
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
