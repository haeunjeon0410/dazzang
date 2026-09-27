import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 모임 통장(공용 계좌) 등록/수정. 방 멤버 누구나 등록 가능
export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { groupBankName, groupAccountNumber, groupAccountHolder } = await req.json();

  const room = await prisma.room.update({
    where: { id: me.roomId },
    data: { groupBankName, groupAccountNumber, groupAccountHolder },
  });

  return NextResponse.json({ room });
}
