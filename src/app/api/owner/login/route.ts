import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { isOwnerCode } from "@/lib/owner";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";

// 전용 화면에서 방 고를 때는 마스터 코드 자체가 본인 확인이라 PIN 없이 바로 로그인
export async function POST(req: NextRequest) {
  if (tooManyRequests(`owner-login:${clientIp(req)}`, 20)) {
    return NextResponse.json({ error: "너무 많이 시도했어요. 잠시 뒤에 다시 해주세요" }, { status: 429 });
  }
  const { code, userId } = await req.json().catch(() => ({}));
  if (!isOwnerCode(code) || typeof userId !== "string") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });

  await setSession(user.id);
  return NextResponse.json({ ok: true });
}
