import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ user: null });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { room: true } });
  if (!user) return NextResponse.json({ user: null });

  const other = await prisma.user.findFirst({ where: { roomId: user.roomId, id: { not: userId } } });

  return NextResponse.json({
    user: { id: user.id, name: user.name },
    room: {
      inviteToken: user.room.inviteToken,
      full: !!other,
      groupBankName: user.room.groupBankName,
      groupAccountNumber: user.room.groupAccountNumber,
      groupAccountHolder: user.room.groupAccountHolder,
    },
    other: other ? { id: other.id, name: other.name } : null,
  });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { name } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
  });

  return NextResponse.json({ user: updated });
}
