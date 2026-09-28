import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const OWNER_CODE = "000000";

// 개발자 도구 전용: 상대방 동의 없이 바로 방 삭제 (나만 쓰는 화면이라 동의 절차 생략)
export async function POST(req: NextRequest) {
  const { code, roomId } = await req.json();
  if (code !== OWNER_CODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({ where: { roomId } });
  const userIds = users.map((u) => u.id);

  await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.excuse.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.settlement.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.checkin.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.room.delete({ where: { id: roomId } });

  return NextResponse.json({ ok: true });
}
