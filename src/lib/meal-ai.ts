// 실험실 식단 인증: 음식 사진을 숙명여대 API 게이트웨이(OpenAI 호환)의 GPT-6 Luna로 분석해 칼로리를 추정한다.
// GATEWAY_API_KEY가 없거나 호출이 실패하면 null을 돌려주고, 호출한 쪽은 분석 없이 사진만 저장한다.
const BASE_URL = (process.env.GATEWAY_BASE_URL || "https://factchat-cloud.mindlogic.ai/v1/gateway").replace(/\/+$/, "");
import { addCredits } from "@/lib/ai-quota";
import { validKg } from "@/lib/weight-ai";

const MODEL = process.env.GATEWAY_MODEL || "gpt-6-luna";

export type MealAnalysis = {
  // 음식 사진인지. false면 운동 인증 등 다른 사진이라 식단으로 저장하지 않는다
  isFood: boolean;
  // 체중계(또는 체중 기록 앱 화면) 사진이면 읽은 몸무게(kg). 몸무게 인증을 켠 사람은 이 사진을 식단/운동이 아니라 몸무게로 기록한다
  scaleKg?: number;
  title: string;
  kcal: number;
  items: { name: string; kcal: number }[];
};

const PROMPT = `너는 다이어트 인증방에서 친구의 식단 사진을 보는 영양 코치야.
사진 속 음식을 보고 1인분 기준 칼로리를 추정해서 JSON 객체 하나로만 답해 (키: isFood, scaleKg, title, kcal, items).
- title: 한 줄 요약 (20자 이내, 예: "닭가슴살 샐러드")
- items: 음식별 이름과 추정 kcal (최대 8개)
- kcal: 전체 합계 (items 합과 같게)
- isFood: 먹거나 마실 것이 조금이라도 보이면 true. 집밥, 도시락, 배달/편의점 음식, 과자·빵·과일, 커피·음료, 먹다 남긴 음식, 흐리거나 어두운 음식 사진도 모두 true.
  음식이 전혀 안 보이는 운동(헬스장, 운동하는 모습, 운동 기록 화면)이나 셀카, 풍경처럼 확실히 아닌 경우에만 false. 애매하면 true로 해
- scaleKg: 체중계 화면이나 체중 기록 앱 화면처럼 몸무게(kg) 숫자가 보이는 사진이면 그 숫자(소수점 한 자리). 아니면 0. 몸무게 사진이면 isFood는 false
음식이 아니면 isFood를 false, title을 "", kcal을 0, items를 빈 배열로 해.
JSON 키는 isFood, scaleKg, title, kcal, items 다섯 개야.`;

// 모델이 코드 블록으로 감싸거나 앞뒤에 말을 붙여도 JSON 부분만 꺼낸다 (mypt에서 쓰는 방식과 같다)
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clean(raw: unknown): MealAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 5000) : 0);
  const items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, 8)
    .map((i) => ({ name: String((i as { name?: unknown })?.name ?? "").slice(0, 30), kcal: num((i as { kcal?: unknown })?.kcal) }))
    .filter((i) => i.name);
  // 모델이 "true"/"false" 글자로 답해도 받아들인다
  const isFood = typeof r.isFood === "boolean" ? r.isFood : r.isFood === "true" ? true : r.isFood === "false" ? false : null;
  if (isFood === null) return null;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 40) : "";
  if (!isFood) {
    const kg = validKg(r.scaleKg);
    return { isFood: false, ...(kg ? { scaleKg: kg } : {}), title: "", kcal: 0, items: [] };
  }
  // 이름을 안 줬어도 음식이 맞으면 첫 음식 이름으로 채운다 (분석 실패로 버리지 않는다)
  const name = title || items[0]?.name || "식사";
  return {
    isFood: true,
    title: name,
    kcal: num(r.kcal) || items.reduce((s, i) => s + i.kcal, 0),
    items,
  };
}

// GPT 계열은 답하기 전에 속으로 생각하는 토큰(추론)을 쓰고 그것도 출력 한도에 들어간다.
// 한도가 작으면 추론만 하다 끝나서 답이 비어 오므로, 추론을 낮추고 한도를 넉넉하게 둔 뒤 빈 답이면 두 배로 한 번 더 시도한다.
const MAX_TOKENS = 1500;

async function callOnce(key: string, dataUrl: string, maxTokens: number): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "이 사진을 분석해 주세요." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  // 크레딧을 가늠할 수 있도록 토큰 수만 남긴다 (사진이나 내용은 남기지 않는다)
  if (data?.usage) {
    console.info("[meal] usage", JSON.stringify(data.usage));
    await addCredits(data.usage.prompt_tokens, data.usage.completion_tokens);
  }
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text.trim() : "";
}

export async function analyzeMealPhoto(dataUrl: string): Promise<MealAnalysis | null> {
  const key = process.env.GATEWAY_API_KEY;
  if (!key) return null;
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(dataUrl)) return null;

  // 사진은 무조건 분석한다: 호출 실패, 빈 답, 읽을 수 없는 답이면 한 번 더 시도한다
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let text = await callOnce(key, dataUrl, MAX_TOKENS);
      if (!text) text = await callOnce(key, dataUrl, MAX_TOKENS * 2);
      const result = text ? clean(extractJson(text)) : null;
      if (result) return result;
    } catch (e) {
      console.error("[meal] gateway", e instanceof Error ? e.message : e);
    }
  }
  return null;
}

// 사용자가 음식을 고치거나 새로 넣었을 때, 이름만 보고 1인분 칼로리를 다시 추정한다 (글자만 보내서 사진보다 훨씬 싸다)
const ESTIMATE_PROMPT = `너는 다이어트 코치야. 음식 이름 목록을 받으면 각각의 1인분 기준 칼로리를 추정해서 JSON 객체 하나로만 답해.
형식: {"kcals":[숫자, ...]} (목록과 같은 순서, 같은 개수)`;

export async function estimateKcals(names: string[]): Promise<number[] | null> {
  const key = process.env.GATEWAY_API_KEY;
  if (!key || names.length === 0) return null;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: ESTIMATE_PROMPT },
          { role: "user", content: JSON.stringify(names) },
        ],
        max_tokens: 1000,
        temperature: 0.2,
        reasoning_effort: "low",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const data = await res.json();
    if (data?.usage) {
    console.info("[meal] usage", JSON.stringify(data.usage));
    await addCredits(data.usage.prompt_tokens, data.usage.completion_tokens);
  }
    const text = data?.choices?.[0]?.message?.content;
    const parsed = typeof text === "string" ? (extractJson(text) as { kcals?: unknown } | null) : null;
    const k = parsed?.kcals;
    if (!Array.isArray(k) || k.length !== names.length) return null;
    return k.map((v) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 5000) : 0));
  } catch (e) {
    console.error("[meal] gateway", e instanceof Error ? e.message : e);
    return null;
  }
}
