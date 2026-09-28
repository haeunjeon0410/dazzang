import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function createRoomCode() {
  return crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

// 방을 만든 뒤 다음 화면에서 닉네임을 정하도록 빈 방만 생성합니다.
export async function POST(req: NextRequest) {
  await req.json().catch(() => ({}));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const room = await prisma.room.create({ data: { inviteToken: createRoomCode() } });
      return NextResponse.json({ inviteToken: room.inviteToken });
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }

  return NextResponse.json({ error: "방 만들기에 실패했어요" }, { status: 500 });
}
