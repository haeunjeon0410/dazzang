// 아주 단순한 요청 횟수 제한 (서버 인스턴스 메모리 기준, 고정 시간 창).
// 서버리스에서는 인스턴스마다 따로 세지만, 방 코드/관리자 코드를 무작정 찍어보는 시도를 크게 늦춘다.
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

// 한도를 넘으면 true
export function tooManyRequests(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    // 오래된 항목 정리 (메모리가 계속 늘지 않게)
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}
