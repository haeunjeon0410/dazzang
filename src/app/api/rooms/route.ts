import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

// 새 방 만들기 (방장 본인이 첫 멤버로 들어감). 친구 수만큼 방을 여러 개 만들 수 있음
export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "닉네임을 입력해주세요" }, { status: 400 });
  }

  const room = await prisma.room.create({
    data: { users: { create: { name: name.trim() } } },
    include: { users: true },
  });

  const host = room.users[0];
  await setSession(host.id);

  return NextResponse.json({ user: { id: host.id, name: host.name }, inviteToken: room.inviteToken });
}
