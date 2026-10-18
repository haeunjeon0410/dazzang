// 실험실 식단 인증: 음식 사진을 숙명여대 API 게이트웨이(OpenAI 호환)의 GPT-6 Luna로 분석해 칼로리를 추정한다.
// GATEWAY_API_KEY가 없거나 호출이 실패하면 null을 돌려주고, 호출한 쪽은 분석 없이 사진만 저장한다.
const BASE_URL = (process.env.GATEWAY_BASE_URL || "https://factchat-cloud.mindlogic.ai/v1/gateway").replace(/\/+$/, "");
const MODEL = process.env.GATEWAY_MODEL || "gpt-6-luna";

export type MealAnalysis = {
  // 음식 사진인지. false면 운동 인증 등 다른 사진이라 식단으로 저장하지 않는다
  isFood: boolean;
  title: string;
  kcal: number;
  items: { name: string; kcal: number }[];
};

const PROMPT = `너는 다이어트 인증방에서 친구의 식단 사진을 보는 영양 코치야.
사진 속 음식을 보고 1인분 기준 칼로리를 추정해서 JSON으로만 답해.
- title: 한 줄 요약 (20자 이내, 예: "닭가슴살 샐러드")
- items: 음식별 이름과 추정 kcal (최대 8개)
- kcal: 전체 합계 (items 합과 같게)
- isFood: 먹거나 마실 음식/음료 사진이면 true. 운동(헬스장, 운동하는 모습, 운동 기록 화면, 셀카 등)이나 그 밖의 사진이면 false
음식이 아니면 isFood를 false, title을 "", kcal을 0, items를 빈 배열로 해.`;

// 게이트웨이의 structured output은 strict + additionalProperties:false 가 필요하다
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    isFood: { type: "boolean" },
    title: { type: "string" },
    kcal: { type: "integer" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, kcal: { type: "integer" } },
        required: ["name", "kcal"],
      },
    },
  },
  required: ["isFood", "title", "kcal", "items"],
};

function clean(raw: unknown): MealAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 5000) : 0);
  const items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 8)
    .map((i) => ({ name: String((i as { name?: unknown })?.name ?? "").slice(0, 30), kcal: num((i as { kcal?: unknown })?.kcal) }))
    .filter((i) => i.name);
  if (typeof r.isFood !== "boolean") return null;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 40) : "";
  if (!r.isFood) return { isFood: false, title: "", kcal: 0, items: [] };
  if (!title) return null;
  return {
    isFood: true,
    title,
    kcal: num(r.kcal) || items.reduce((s, i) => s + i.kcal, 0),
    items,
  };
}

export async function analyzeMealPhoto(dataUrl: string): Promise<MealAnalysis | null> {
  const key = process.env.GATEWAY_API_KEY;
  if (!key) return null;
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(dataUrl)) return null;

  try {
    const res = await fetch(`${BASE_URL}/chat/completions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: { name: "meal_analysis", strict: true, schema: SCHEMA } },
        // 생각(reasoning) 토큰도 이 한도에 들어가서 너무 낮으면 빈 응답이 올 수 있다. 낮은 강도로 비용을 줄인다
        reasoning_effort: "low",
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error("[meal] gateway", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = await res.json();
    // 크레딧을 가늠할 수 있도록 토큰 수만 남긴다 (사진이나 내용은 남기지 않는다)
    if (data?.usage) console.info("[meal] usage", JSON.stringify(data.usage));
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? clean(JSON.parse(text)) : null;
  } catch (e) {
    console.error("[meal] gateway", e instanceof Error ? e.message : e);
    return null;
  }
}
