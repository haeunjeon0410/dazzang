import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

const OWNER_CODE = "000000";

// 전용 화면에서 방 고를 때는 마스터 코드 자체가 본인 확인이라 PIN 없이 바로 로그인
export async function POST(req: NextRequest) {
  const { code, userId } = await req.json();
  if (code !== OWNER_CODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });

  await setSession(user.id);
  return NextResponse.json({ ok: true });
}
