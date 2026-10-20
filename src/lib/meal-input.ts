// 식단 등록/수정 화면에서 올라오는 값 검사. 이름, 칼로리, 음식별 먹은 비율을 서버에서 다시 정리해서 저장한다.
export type MealItem = {
  name: string;
  kcal: number; // qty만큼 전체의 칼로리 (양을 바꾸면 비례해서 바뀐다)
  qty?: number; // 사진에서 가늠한(또는 사용자가 고친) 양: 3 (없으면 1로 본다)
  unit?: string; // 양의 단위: 인분, 그릇, 접시, 개 ...
  fraction?: number; // 이 음식을 먹은 비율 0.1~1 (없으면 다 먹음)
};

export type MealInput = {
  title: string;
  items: MealItem[];
  fraction: number; // 예전 전체 비율 칸. 지금은 음식별로 정하므로 늘 1
  kcal: number; // 음식별 (칼로리 × 먹은 비율)의 합 = 실제로 먹은 칼로리
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 5000) : 0);
const frac = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0.1, Math.round(v * 100) / 100)) : 1;

// 양은 0.5 단위로 0.5~5000 (g, ml도 담는다). 아닌 값은 없는 것으로 본다
export const qtyOf = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0.5 ? Math.min(5000, Math.round(v * 2) / 2) : undefined;
export const unitOf = (v: unknown): string | undefined => {
  const u = typeof v === "string" ? v.trim().slice(0, 6) : "";
  return u || undefined;
};

export const eatenKcal = (i: MealItem) => Math.round(i.kcal * (i.fraction ?? 1));

export function parseMealInput(raw: unknown): MealInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 40) : "";
  if (!title) return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 8)
    .map((i) => {
      const qty = qtyOf((i as { qty?: unknown })?.qty);
      return {
        name: String((i as { name?: unknown })?.name ?? "").trim().slice(0, 30),
        kcal: num((i as { kcal?: unknown })?.kcal),
        ...(qty !== undefined ? { qty, unit: unitOf((i as { unit?: unknown })?.unit) ?? "인분" } : {}),
        fraction: frac((i as { fraction?: unknown })?.fraction),
      };
    })
    .filter((i) => i.name);
  return { title, items, fraction: 1, kcal: items.reduce((s, i) => s + eatenKcal(i), 0) };
}

// 음식 사진 분석 결과에서 저장 전 초안 값을 만든다 (처음에는 모두 다 먹은 것으로 본다)
export function draftFromAnalysis(a: { title: string; items: MealItem[]; kcal: number }): MealInput {
  const items = (a.items.length ? a.items : [{ name: a.title, kcal: a.kcal }]).map((i) => ({ ...i, fraction: 1 }));
  return { title: a.title, items, fraction: 1, kcal: items.reduce((s, i) => s + i.kcal, 0) };
}
