import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

// 초대 링크로 들어온 친구가 닉네임 정하고 방에 합류
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { name } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "닉네임을 입력해주세요" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { inviteToken: token }, include: { users: true } });
  if (!room) return NextResponse.json({ error: "존재하지 않는 방입니다" }, { status: 404 });
  if (room.users.length >= 2) {
    return NextResponse.json({ error: "이 방은 이미 인원이 다 찼어요" }, { status: 400 });
  }

  const user = await prisma.user.create({ data: { roomId: room.id, name: name.trim() } });
  await setSession(user.id);

  return NextResponse.json({ user: { id: user.id, name: user.name } });
}
