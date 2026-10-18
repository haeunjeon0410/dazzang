import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { estimateKcals } from "@/lib/meal-ai";
import { tooManyRequests } from "@/lib/rate-limit";
import { takeAiQuota } from "@/lib/ai-quota";

// 식단 확인 창에서 음식을 고치거나 새로 넣었을 때, 이름만으로 1인분 칼로리를 다시 계산해 준다
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (tooManyRequests(`meal-est:${userId}`, 30)) {
    return NextResponse.json({ error: "너무 빨라요. 잠시 뒤에 다시 해 주세요" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const names = (Array.isArray(body?.names) ? body.names : [])
    .slice(0, 8)
    .map((n: unknown) => String(n ?? "").trim().slice(0, 30))
    .filter(Boolean);
  if (names.length === 0) return NextResponse.json({ error: "음식 이름이 없어요" }, { status: 400 });

  // 한도를 넘으면 계산하지 않는다 (칼로리는 0으로 저장된다)
  const quota = await takeAiQuota(userId, "text");
  if (quota !== "ok") return NextResponse.json({ kcals: null, limit: quota });
  const kcals = await estimateKcals(names);
  return NextResponse.json({ kcals });
}
