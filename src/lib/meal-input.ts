// 식단 등록/수정 화면에서 올라오는 값 검사. 이름, 칼로리, 먹은 비율을 서버에서 다시 정리해서 저장한다.
export type MealItem = { name: string; kcal: number };

export type MealInput = {
  title: string;
  items: MealItem[];
  fraction: number; // 먹은 비율 0.1~1
  kcal: number; // items 합 × fraction (실제로 먹은 칼로리)
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 5000) : 0);

export function parseMealInput(raw: unknown): MealInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 40) : "";
  if (!title) return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 8)
    .map((i) => ({
      name: String((i as { name?: unknown })?.name ?? "").trim().slice(0, 30),
      kcal: num((i as { kcal?: unknown })?.kcal),
    }))
    .filter((i) => i.name);
  const f = typeof r.fraction === "number" && Number.isFinite(r.fraction) ? r.fraction : 1;
  const fraction = Math.min(1, Math.max(0.1, Math.round(f * 100) / 100));
  const total = items.reduce((s, i) => s + i.kcal, 0);
  return { title, items, fraction, kcal: Math.round(total * fraction) };
}

// 음식 사진 분석 결과(items 합계 기준)에서 저장 전 초안 값을 만든다
export function draftFromAnalysis(a: { title: string; items: MealItem[]; kcal: number }): MealInput {
  const items = a.items.length ? a.items : [{ name: a.title, kcal: a.kcal }];
  return { title: a.title, items, fraction: 1, kcal: items.reduce((s, i) => s + i.kcal, 0) };
}
