import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "session";
const SECRET = process.env.SESSION_SECRET || "dev-secret";

function sign(userId: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(userId).digest("hex");
  return `${userId}.${hmac}`;
}

function verify(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(userId).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
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
