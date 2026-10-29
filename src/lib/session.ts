import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "session";
const SECRET = process.env.SESSION_SECRET || "dev-secret";
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("[security] SESSION_SECRET이 설정되지 않았어요. 누구나 로그인 쿠키를 만들 수 있으니 Vercel 환경변수에 꼭 넣어 주세요");
}

function sign(userId: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(userId).digest("hex");
  return `${userId}.${hmac}`;
}

function verify(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(userId).digest("hex");
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  return userId;
}

export async function setSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verify(token);
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
