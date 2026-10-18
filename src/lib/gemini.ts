// 실험실 식단 인증: 음식 사진을 Gemini(무료 티어)로 분석해 칼로리를 추정한다.
// GEMINI_API_KEY가 없거나 호출이 실패하면 null을 돌려주고, 호출한 쪽은 분석 없이 사진만 저장한다.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export type MealAnalysis = {
  title: string;
  kcal: number;
  items: { name: string; kcal: number }[];
  comment: string;
};

const PROMPT = `너는 다이어트 인증방에서 친구의 식단 사진을 보는 영양 코치야.
사진 속 음식을 보고 1인분 기준 칼로리를 추정해서 JSON으로만 답해.
- title: 한 줄 요약 (20자 이내, 예: "닭가슴살 샐러드")
- items: 음식별 이름과 추정 kcal (최대 8개)
- kcal: 전체 합계 (items 합과 같게)
- comment: 친구에게 보여줄 따뜻하고 가벼운 한마디 (40자 이내, 존댓말 말고 반말, 훈계 금지)
음식이 아니거나 알아볼 수 없으면 title을 "음식이 아닌 것 같아요", kcal을 0, items를 빈 배열로 해.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    kcal: { type: "INTEGER" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, kcal: { type: "INTEGER" } },
        required: ["name", "kcal"],
      },
    },
    comment: { type: "STRING" },
  },
  required: ["title", "kcal", "items", "comment"],
};

function clean(raw: unknown): MealAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 5000) : 0);
  const items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 8)
    .map((i) => ({ name: String((i as { name?: unknown })?.name ?? "").slice(0, 30), kcal: num((i as { kcal?: unknown })?.kcal) }))
    .filter((i) => i.name);
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 40) : "";
  if (!title) return null;
  return {
    title,
    kcal: num(r.kcal) || items.reduce((s, i) => s + i.kcal, 0),
    items,
    comment: typeof r.comment === "string" ? r.comment.trim().slice(0, 80) : "",
  };
}

export async function analyzeMealPhoto(dataUrl: string): Promise<MealAnalysis | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return null;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[meal] gemini", res.status);
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? clean(JSON.parse(text)) : null;
  } catch (e) {
    console.error("[meal] gemini", e instanceof Error ? e.message : e);
    return null;
  }
}
