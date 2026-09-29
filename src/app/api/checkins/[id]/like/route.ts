import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToSubscriptions } from "@/lib/push";

// 인증샷에 좋아요(칭찬) 토글. 본인 사진은 못 누르고, 같은 방 상대방만 가능
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const checkin = await prisma.checkin.findUnique({ where: { id }, include: { user: { include: { subscriptions: true } } } });
  if (!checkin || checkin.user.roomId !== me.roomId) {
    return NextResponse.json({ error: "인증을 찾을 수 없습니다" }, { status: 404 });
  }
  if (checkin.userId === userId) {
    return NextResponse.json({ error: "본인 사진에는 좋아요를 누를 수 없어요" }, { status: 403 });
  }

  const updated = await prisma.checkin.update({ where: { id }, data: { liked: !checkin.liked } });

  if (updated.liked) {
    await sendPushToSubscriptions(checkin.user.subscriptions, {
      title: "칭찬 도착!",
      body: `${me.name}님이 오늘 인증샷에 좋아요를 눌렀어요`,
    });
  }

  return NextResponse.json({ liked: updated.liked });
}
