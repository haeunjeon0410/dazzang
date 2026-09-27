import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 초대 링크로 들어왔을 때 방 정보(멤버 목록, 정원 여부) 조회용. 비밀정보 없음
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const room = await prisma.room.findUnique({
    where: { inviteToken: token },
    include: { users: { select: { id: true, name: true } } },
  });

  if (!room) return NextResponse.json({ error: "존재하지 않는 방입니다" }, { status: 404 });

  return NextResponse.json({
    members: room.users,
    full: room.users.length >= 2,
  });
}
