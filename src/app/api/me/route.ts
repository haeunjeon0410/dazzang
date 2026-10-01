import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { CAPTION_MAX_LEN } from "@/lib/captions";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ user: null });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { room: true } });
  if (!user) return NextResponse.json({ user: null });

  const other = await prisma.user.findFirst({ where: { roomId: user.roomId, id: { not: userId } } });

  return NextResponse.json({
    user: { id: user.id, name: user.name, captions: user.captions },
    room: {
      inviteToken: user.room.inviteToken,
      full: !!other,
      groupBankName: user.room.groupBankName,
      groupAccountNumber: user.room.groupAccountNumber,
      groupAccountHolder: user.room.groupAccountHolder,
      deleteRequestedBy: user.room.deleteRequestedBy,
      pauseRequestedBy: user.room.pauseRequestedBy,
      pauseRequestedUntil: user.room.pauseRequestedUntil,
      pausedUntil: user.room.pausedUntil,
    },
    other: other ? { id: other.id, name: other.name, captions: other.captions } : null,
  });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { name, captions, caption } = await req.json();

  if (caption !== undefined) {
    if (typeof caption !== "string") {
      return NextResponse.json({ error: "멘트 형식이 올바르지 않아요" }, { status: 400 });
    }
    const trimmed = caption.trim();
    if (trimmed.length > CAPTION_MAX_LEN) {
      return NextResponse.json({ error: `멘트는 ${CAPTION_MAX_LEN}자까지 쓸 수 있어요` }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { captions: [trimmed, trimmed, trimmed, trimmed] } });
    return NextResponse.json({ ok: true });
  }

  // 말풍선 멘트 수정 (0회/1회/2회/3회 4칸)
  if (captions !== undefined) {
    if (!Array.isArray(captions) || captions.length !== 4 || captions.some((c) => typeof c !== "string")) {
      return NextResponse.json({ error: "멘트 형식이 올바르지 않아요" }, { status: 400 });
    }
    const trimmed = (captions as string[]).map((c) => c.trim());
    if (trimmed.some((c) => c.length > CAPTION_MAX_LEN)) {
      return NextResponse.json({ error: `멘트는 ${CAPTION_MAX_LEN}자까지 쓸 수 있어요` }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { captions: trimmed } });
    return NextResponse.json({ ok: true });
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
  });

  return NextResponse.json({ user: updated });
}
