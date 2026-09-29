import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 인증샷에 좋아요(칭찬). 본인 사진은 못 누르고, 같은 방 상대방만 가능. 인스타처럼 한번 누르면 취소 불가
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const checkin = await prisma.checkin.findUnique({ where: { id } });
  if (!checkin || checkin.userId === null) {
    return NextResponse.json({ error: "인증을 찾을 수 없습니다" }, { status: 404 });
  }
  const owner = await prisma.user.findUnique({ where: { id: checkin.userId } });
  if (!owner || owner.roomId !== me.roomId) {
    return NextResponse.json({ error: "인증을 찾을 수 없습니다" }, { status: 404 });
  }
  if (checkin.userId === userId) {
    return NextResponse.json({ error: "본인 사진에는 좋아요를 누를 수 없어요" }, { status: 403 });
  }
  if (checkin.liked) {
    return NextResponse.json({ liked: true });
  }

  await prisma.checkin.update({ where: { id }, data: { liked: true } });
  return NextResponse.json({ liked: true });
}
