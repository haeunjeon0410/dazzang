import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";

// 초대 링크로 들어왔을 때 방 정보(멤버 목록, 정원 여부) 조회용. 비밀정보 없음
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (tooManyRequests(`room:${clientIp(req)}`, 30)) {
    return NextResponse.json({ error: "너무 많이 시도했어요. 잠시 뒤에 다시 해주세요" }, { status: 429 });
  }
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
