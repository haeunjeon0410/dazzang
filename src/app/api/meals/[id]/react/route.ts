import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { isReaction } from "@/lib/reactions";

// 식단 사진에 이모티콘 반응(칭찬). 본인 식단에는 못 남기고, 같은 방 상대방만 가능하다.
// 운동 인증샷과 같이 한 번 고르면 바꾸거나 취소할 수 없다. body.emoji가 없거나 이모티콘이 아니면 하트로 본다
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { id } = await params;

  const meal = await prisma.meal.findUnique({
    where: { id },
    select: { userId: true, confirmed: true, reaction: true, user: { select: { roomId: true } } },
  });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { roomId: true } });
  // 확인 전 초안은 친구에게 안 보이는 식단이라 반응도 남길 수 없다
  if (!meal || !me || !meal.confirmed || meal.user.roomId !== me.roomId) {
    return NextResponse.json({ error: "식단을 찾을 수 없습니다" }, { status: 404 });
  }
  if (meal.userId === userId) {
    return NextResponse.json({ error: "내 식단에는 반응을 남길 수 없어요" }, { status: 403 });
  }
  if (meal.reaction) return NextResponse.json({ reaction: meal.reaction });

  const body = await req.json().catch(() => null);
  const reaction = isReaction(body?.emoji) ? body.emoji : "❤️";
  // 동시에 두 번 눌러도 먼저 들어온 하나만 남게 아직 반응이 없을 때만 저장한다
  const saved = await prisma.meal.updateMany({ where: { id, reaction: null }, data: { reaction } });
  if (saved.count === 0) {
    const now = await prisma.meal.findUnique({ where: { id }, select: { reaction: true } });
    return NextResponse.json({ reaction: now?.reaction ?? reaction });
  }
  return NextResponse.json({ reaction });
}
