import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

// 친구 둘만 쓰는 개인용 앱이라 접속코드 없이 이름만 골라서 들어감
export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: "누구인지 선택해주세요" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }

  await setSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name });
}
