// 실험실 식단 인증: 음식 사진을 숙명여대 API 게이트웨이(BAZE, OpenAI 호환)의 GPT-6 Luna로 분석해 칼로리를 추정한다.
// 키가 없거나 호출이 실패하면 null을 돌려주고, 호출한 쪽이 다시 올리게 안내한다.
// 환경변수는 mypt와 같은 BAZE_* 이름을 쓴다 (예전 GATEWAY_* 이름도 그대로 받는다):
//   BAZE_API_KEY (필수), BAZE_BASE_URL (선택), BAZE_IMAGE_MODEL (선택, 기본 gpt-6-luna)
import { addCredits } from "@/lib/ai-quota";
import { validKg } from "@/lib/weight-ai";
import { qtyOf, unitOf } from "@/lib/meal-input";

const BASE_URL = (process.env.BAZE_BASE_URL || process.env.GATEWAY_BASE_URL || "https://factchat-cloud.mindlogic.ai/v1/gateway").replace(/\/+$/, "");
const MODEL = process.env.BAZE_IMAGE_MODEL || process.env.BAZE_CHAT_MODEL || process.env.GATEWAY_MODEL || "gpt-6-luna";
const aiKey = () => process.env.BAZE_API_KEY || process.env.GATEWAY_API_KEY;

export type PhotoCategory = "food" | "scale" | "workout" | "other";

export type MealAnalysis = {
  // 사진이 무엇인지: 음식(식단) | 체중계/체중 앱(몸무게) | 운동 | 기타
  category: PhotoCategory;
  // 음식 사진인지 (category === "food"). false면 식단으로 저장하지 않는다
  isFood: boolean;
  // 체중계(또는 체중 기록 앱 화면) 사진이면 읽은 몸무게(kg). 몸무게 인증을 켠 사람은 이 사진을 식단/운동이 아니라 몸무게로 기록한다
  scaleKg?: number;
  title: string;
  kcal: number;
  items: { name: string; kcal: number; qty?: number; unit?: string }[];
};

const PROMPT = `너는 다이어트 인증방에 올라온 사진이 무엇인지 분류하고, 음식이면 칼로리까지 추정하는 코치야.
올라오는 사진은 아래 넷 중 정확히 하나야. 사진의 '주인공'을 보고 category를 골라.
- "food": 먹거나 마실 음식·음료가 주인공 (집밥, 도시락, 배달/편의점 음식, 과자·빵·과일, 커피·음료, 먹다 남긴 음식, 흐리거나 어두운 음식 사진)
- "scale": 체중계 화면이나 체중 기록 앱 화면처럼 몸무게(kg) 숫자가 주인공
- "workout": 운동 인증 (헬스장, 운동하는 모습, 운동 기구, 운동복 인증샷, 러닝·걷기·운동 기록 앱 화면)
- "other": 위 셋 어디에도 안 맞는 사진 (풍경, 물건, 글자 등)
배경에 음식이나 물병이 살짝 보여도 주인공이 운동 장면·사람·체중계면 food가 아니야.

JSON 객체 하나로만 답해 (키: category, scaleKg, title, kcal, items).
- category: 위 넷 중 하나
- scaleKg: category가 "scale"이면 화면에 보이는 몸무게 숫자(소수점 한 자리). 아니면 0
- title: category가 "food"일 때 한 줄 요약 (20자 이내, 예: "닭가슴살 샐러드")
- items: category가 "food"일 때 사진에 보이는 음식별 {name, qty, unit, kcal} (최대 8개).
  name은 양을 뺀 음식 이름만 ("막창", "쌀국수"). qty는 사진에서 가늠한 양을 인분 단위 숫자로 (0.5 단위, 예: 반 접시 0.5, 막창 3인분 3). unit은 항상 "인분".
  kcal은 그 양(qty) 전체의 칼로리야. 1인분으로 줄여서 말하지 마. 예: {"name":"막창","qty":3,"unit":"인분","kcal":1500}
- kcal: category가 "food"일 때 사진에 보이는 음식 전체의 합계 (items 합과 같게)
양 가늠하는 법: 접시·그릇·불판·냄비의 크기, 젓가락·숟가락·손과 비교한 크기, 같은 음식이 몇 접시·몇 점·몇 개인지를 세어 봐.
여럿이 나눠 먹을 양이어도 사진에 보이는 건 전부 더해. 기름진 고기·곱창·막창·튀김은 양이 많으면 칼로리가 크게 늘어.
감각을 맞추는 예 (대략): 공기밥 1공기 300kcal, 쌀국수 1그릇 500, 돈까스 1접시 800, 삼겹살 100g 330, 막창·곱창 1인분(150~200g) 450~600, 치킨 1마리 1,700, 라면 1봉지 500, 방울토마토 1알 4, 사과 1개 120, 계란 1개 75, 닭가슴살 100g 110. 작은 과일·채소는 개수나 g으로 현실적으로 계산해.
food가 아니면 title을 "", kcal을 0, items를 빈 배열로 해.
JSON 키는 category, scaleKg, title, kcal, items 다섯 개야 (items 안의 키는 name, qty, unit, kcal).`;

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
    .map((i) => {
      const qty = qtyOf((i as { qty?: unknown })?.qty);
      return {
        name: String((i as { name?: unknown })?.name ?? "").slice(0, 30),
        kcal: num((i as { kcal?: unknown })?.kcal),
        ...(qty !== undefined ? { qty, unit: unitOf((i as { unit?: unknown })?.unit) ?? "인분" } : {}),
      };
    })
    .filter((i) => i.name);
  const CATEGORIES: PhotoCategory[] = ["food", "scale", "workout", "other"];
  const given = typeof r.category === "string" ? (r.category.trim().toLowerCase() as PhotoCategory) : null;
  // 예전 형식(isFood만 온 답)도 받아들인다
  const legacy = r.isFood === true || r.isFood === "true" ? "food" : r.isFood === false || r.isFood === "false" ? "other" : null;
  const category = given && CATEGORIES.includes(given) ? given : legacy;
  if (!category) return null;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, 40) : "";
  if (category === "scale") {
    const kg = validKg(r.scaleKg);
    // 체중계인데 숫자를 못 읽었으면 분류가 아니라 읽기 실패다
    if (!kg) return null;
    return { category, isFood: false, scaleKg: kg, title: "", kcal: 0, items: [] };
  }
  if (category !== "food") return { category, isFood: false, title: "", kcal: 0, items: [] };
  // 이름을 안 줬어도 음식이 맞으면 첫 음식 이름으로 채운다 (분석 실패로 버리지 않는다)
  const name = title || items[0]?.name || "식사";
  return {
    category: "food",
    isFood: true,
    title: name,
    kcal: num(r.kcal) || items.reduce((s, i) => s + i.kcal, 0),
    items,
  };
}

// GPT 계열은 답하기 전에 속으로 생각하는 토큰(추론)을 쓰고 그것도 출력 한도에 들어간다.
// 한도가 작으면 추론만 하다 끝나서 답이 비어 오므로, 추론을 낮추고 한도를 넉넉하게 둔 뒤 빈 답이면 두 배로 한 번 더 시도한다.
const MAX_TOKENS = 1500;

// 서버 함수가 60초에 강제로 끊기므로(응답도 알림도 없이), 사진 분석 전체를 이 시간 안에 끝낸다
const TOTAL_BUDGET_MS = 50_000;
const MIN_CALL_MS = 8_000;

async function callOnce(key: string, dataUrl: string, maxTokens: number, timeoutMs: number): Promise<string> {
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
    signal: AbortSignal.timeout(timeoutMs),
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
  return (await analyzeMealPhotoDetailed(dataUrl)).analysis;
}

// 분석이 안 됐을 때 왜 안 됐는지(failure)도 같이 돌려준다: no-key | gateway-<HTTP 코드> | timeout | network | unreadable
export async function analyzeMealPhotoDetailed(dataUrl: string): Promise<{ analysis: MealAnalysis | null; failure?: string }> {
  const key = aiKey();
  if (!key) {
    console.error("[meal] BAZE_API_KEY가 설정되지 않았어요");
    return { analysis: null, failure: "no-key" };
  }
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(dataUrl)) return { analysis: null, failure: "unreadable" };

  // 사진은 무조건 분석한다: 호출 실패, 빈 답, 읽을 수 없는 답이면 남은 시간 안에서 한 번 더 시도한다
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const remaining = () => deadline - Date.now();
  let failure = "timeout";
  for (let attempt = 0; attempt < 2 && remaining() > MIN_CALL_MS; attempt++) {
    try {
      let text = await callOnce(key, dataUrl, MAX_TOKENS, Math.min(30_000, remaining()));
      if (!text && remaining() > MIN_CALL_MS) text = await callOnce(key, dataUrl, MAX_TOKENS * 2, Math.min(30_000, remaining()));
      const result = text ? clean(extractJson(text)) : null;
      if (result) return { analysis: result };
      failure = "unreadable";
      // 왜 못 읽었는지 서버 로그에 남긴다 (사진은 남기지 않고 답 앞부분만)
      console.error("[meal] unreadable answer", JSON.stringify(text.slice(0, 300)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const name = e instanceof Error ? e.name : "";
      failure = name === "TimeoutError" || name === "AbortError" ? "timeout" : msg.startsWith("gateway ") ? msg.replace(" ", "-") : "network";
      console.error("[meal] gateway", msg);
    }
  }
  return { analysis: null, failure };
}

// 사용자가 음식을 고치거나 새로 넣었을 때, 이름만 보고 칼로리를 다시 추정한다 (글자만 보내서 사진보다 훨씬 싸다).
// 이름에 양이 적혀 있으면("막창 3인분", "삼겹살 300g") 그 양 전체로, 없으면 1인분으로 계산한다
const ESTIMATE_PROMPT = `너는 다이어트 코치야. 음식 이름 목록을 받으면 각각의 칼로리를 추정해서 JSON 객체 하나로만 답해.
이름에 양이 적혀 있으면(예: "막창 3인분", "공기밥 2공기", "삼겹살 300g", "방울토마토 10알", "치킨 반 마리") 그 양 전체의 칼로리를, 양이 없으면 1인분(1그릇, 1접시) 기준으로 계산해. 1인분으로 줄이지 마.
계산 방법: g나 ml면 그 음식 100g(100ml)당 칼로리 x 양/100. 개·알·조각·마리면 1개당 칼로리 x 개수. 인분·그릇·접시·공기면 1인분 칼로리 x 양.
작은 음식도 현실적으로 계산해: 방울토마토는 100g에 20kcal, 1알에 3~4kcal야.
감각을 맞추는 예 (대략): 공기밥 1공기 300kcal, 쌀국수 1그릇 500, 돈까스 1접시 800, 삼겹살 100g 330, 막창·곱창 1인분(150~200g) 450~600, 치킨 1마리 1,700, 닭가슴살 100g 110, 계란 1개 75, 사과 1개 120, 바나나 1개 100, 고구마 100g 130, 아몬드 10알 70.
형식: {"kcals":[숫자, ...]} (목록과 같은 순서, 같은 개수)`;

export async function estimateKcals(names: string[]): Promise<number[] | null> {
  const key = aiKey();
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
        max_tokens: 2000,
        temperature: 0.2,
        reasoning_effort: "medium",
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
