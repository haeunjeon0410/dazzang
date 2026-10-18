import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 내가 올린 운동 인증샷 지우기. 같은 사람의 다른 방 계정(linkGroup)에 똑같이 올라간 같은 인증도 함께 지운다
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const checkin = await prisma.checkin.findUnique({ where: { id } });
  if (!checkin || checkin.userId !== userId) {
    return NextResponse.json({ error: "인증을 찾을 수 없습니다" }, { status: 404 });
  }

  const me = await prisma.user.findUnique({ where: { id: userId } });
  const linked = me?.linkGroup
    ? await prisma.user.findMany({ where: { linkGroup: me.linkGroup, id: { not: userId } }, select: { id: true } })
    : [];
  // 올릴 때 같은 촬영 시각(createdAt)으로 만들어지므로 그 시각으로 짝을 찾는다
  await prisma.$transaction([
    prisma.checkin.delete({ where: { id } }),
    prisma.checkin.deleteMany({ where: { userId: { in: linked.map((u) => u.id) }, createdAt: checkin.createdAt } }),
  ]);
  return NextResponse.json({ ok: true });
}
