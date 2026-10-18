// 체중계 사진에서 읽은 몸무게를 "확인 뒤에 기록"하기 위한 서명 토큰.
// 서버가 사진을 읽은 결과(kg)에 서명해서 돌려주고, 사용자가 맞다고 확인하면 그 토큰으로만 기록한다.
// 그래서 확인 단계에서 숫자를 마음대로 바꿔 보낼 수 없다 (사진 인증 규칙 유지). 토큰은 15분 안에, 같은 주에만 유효하다.
import crypto from "crypto";
import { getWeekStart } from "@/lib/week";

const SECRET = process.env.SESSION_SECRET || "dev-secret";
const TTL_MS = 15 * 60 * 1000;

type Payload = { u: string; k: number; w: number; e: number };

const sign = (body: string) => crypto.createHmac("sha256", SECRET).update(`weight:${body}`).digest("hex");

export function signWeight(userId: string, kg: number): string {
  const payload: Payload = { u: userId, k: kg, w: getWeekStart().getTime(), e: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

// 내가 받은 토큰이고 아직 유효하면 kg, 아니면 null
export function verifyWeight(token: unknown, userId: string): number | null {
  if (typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const given = Buffer.from(sig);
  const want = Buffer.from(sign(body));
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (p.u !== userId || p.e < Date.now() || p.w !== getWeekStart().getTime()) return null;
    return typeof p.k === "number" ? p.k : null;
  } catch {
    return null;
  }
}
