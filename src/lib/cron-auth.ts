import { NextRequest } from "next/server";

// 크론 주소 인증. CRON_SECRET이 설정되지 않았으면 아무도 통과하지 못한다
// (예전에는 비어 있을 때 "Bearer undefined" 헤더로 통과할 수 있었다)
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.nextUrl.searchParams.get("secret") === secret || req.headers.get("authorization") === `Bearer ${secret}`;
}
