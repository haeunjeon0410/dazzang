import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";

function createRoomCode() {
  return crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

// 방을 만든 뒤 다음 화면에서 닉네임을 정하도록 빈 방만 생성합니다.
// 같은 곳에서 방을 계속 만들어 DB를 채우지 못하게 시간당 횟수를 제한한다
export async function POST(req: NextRequest) {
  if (tooManyRequests(`rooms:${clientIp(req)}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: "방을 너무 많이 만들었어요. 잠시 뒤에 다시 해주세요" }, { status: 429 });
  }
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
