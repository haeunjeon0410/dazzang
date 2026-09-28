import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 모임 통장(공용 계좌) 등록/수정 + 방 삭제/일시정지 요청/확정/취소
export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // ── 기존: 모임 통장 수정 ──────────────────────────────────────
  if (!action) {
    const { groupBankName, groupAccountNumber, groupAccountHolder } = body;
    const room = await prisma.room.update({
      where: { id: me.roomId },
      data: { groupBankName, groupAccountNumber, groupAccountHolder },
    });
    return NextResponse.json({ room });
  }

  // ── 방 삭제 요청 ──────────────────────────────────────────────
  if (action === "request-delete") {
    await prisma.room.update({
      where: { id: me.roomId },
      data: { deleteRequestedBy: userId },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel-delete") {
    const room = await prisma.room.findUnique({ where: { id: me.roomId } });
    if (room?.deleteRequestedBy !== userId) {
      return NextResponse.json({ error: "요청자만 취소할 수 있어요" }, { status: 403 });
    }
    await prisma.room.update({
      where: { id: me.roomId },
      data: { deleteRequestedBy: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "confirm-delete") {
    const room = await prisma.room.findUnique({ where: { id: me.roomId } });
    // 본인이 요청한 건 본인이 확정 불가
    if (!room?.deleteRequestedBy || room.deleteRequestedBy === userId) {
      return NextResponse.json({ error: "상대방의 요청만 수락할 수 있어요" }, { status: 403 });
    }

    // Cascade 삭제 (FK 순서대로)
    const users = await prisma.user.findMany({ where: { roomId: me.roomId } });
    const userIds = users.map((u) => u.id);

    await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.excuse.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.settlement.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.checkin.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.room.delete({ where: { id: me.roomId } });

    return NextResponse.json({ ok: true, deleted: true });
  }

  // ── 일시정지 요청 ─────────────────────────────────────────────
  if (action === "request-pause") {
    const weeks = Number(body.weeks);
    if (!weeks || weeks < 1 || weeks > 8) {
      return NextResponse.json({ error: "1~8주 사이로 선택해주세요" }, { status: 400 });
    }
    const pauseRequestedUntil = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
    await prisma.room.update({
      where: { id: me.roomId },
      data: { pauseRequestedBy: userId, pauseRequestedUntil },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel-pause") {
    // 요청 취소 OR 진행 중인 정지 취소 — 양쪽 모두 가능
    await prisma.room.update({
      where: { id: me.roomId },
      data: {
        pauseRequestedBy: null,
        pauseRequestedUntil: null,
        pausedUntil: null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "confirm-pause") {
    const room = await prisma.room.findUnique({ where: { id: me.roomId } });
    if (!room?.pauseRequestedBy || room.pauseRequestedBy === userId) {
      return NextResponse.json({ error: "상대방의 요청만 수락할 수 있어요" }, { status: 403 });
    }
    await prisma.room.update({
      where: { id: me.roomId },
      data: {
        pausedUntil: room.pauseRequestedUntil,
        pauseRequestedBy: null,
        pauseRequestedUntil: null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 액션이에요" }, { status: 400 });
}
