import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { name, pin } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "닉네임을 입력해주세요" }, { status: 400 });
  }
  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "4자리 숫자 PIN을 입력해주세요" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { inviteToken: token } });
  if (!room) return NextResponse.json({ error: "존재하지 않는 방입니다" }, { status: 404 });

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      // 방 행을 먼저 잠가 동시 입장 요청이 정원 검사를 우회하지 못하게 합니다.
      await tx.room.update({ where: { id: room.id }, data: { createdAt: room.createdAt } });
      const memberCount = await tx.user.count({ where: { roomId: room.id } });
      if (memberCount >= 2) throw new Error("ROOM_FULL");
      return tx.user.create({ data: { roomId: room.id, name: name.trim(), pin } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ROOM_FULL") {
      return NextResponse.json({ error: "이 방은 이미 2명으로 가득 찼어요" }, { status: 400 });
    }
    throw error;
  }

  await setSession(user.id);
  return NextResponse.json({ user: { id: user.id, name: user.name } });
}
