import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { isReaction, reactionOf } from "@/lib/reactions";

// 인증샷에 이모티콘 반응(칭찬). 본인 사진은 못 누르고, 같은 방 상대방만 가능. 이모티콘은 아무거나 하나. 인스타처럼 한번 고르면 바꾸거나 취소할 수 없다.
// body.emoji가 없으면 예전처럼 하트로 본다
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
  // 이미 반응을 남겼으면 그대로 돌려준다 (바꾸지 않는다)
  const existing = reactionOf(checkin);
  if (existing) {
    return NextResponse.json({ liked: true, reaction: existing });
  }

  const body = await req.json().catch(() => null);
  const reaction = isReaction(body?.emoji) ? body.emoji : "❤️";
  // 동시에 두 번 눌러도 먼저 들어온 하나만 남게 아직 반응이 없을 때만 저장한다
  const saved = await prisma.checkin.updateMany({ where: { id, liked: false, reaction: null }, data: { liked: true, reaction } });
  if (saved.count === 0) {
    const now = await prisma.checkin.findUnique({ where: { id }, select: { liked: true, reaction: true } });
    return NextResponse.json({ liked: true, reaction: now ? reactionOf(now) : reaction });
  }
  return NextResponse.json({ liked: true, reaction });
}
