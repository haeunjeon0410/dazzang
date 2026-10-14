import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { getWeekStart, formatResumeDate } from "@/lib/week";

// 모임 통장(공용 계좌) 등록/수정 + 일시정지 요청/확정/취소
export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // ── 기존: 모임 통장 수정 ──────────────────────────────────────
  if (!action) {
    const { groupBankName, groupAccountNumber } = body;
    const room = await prisma.room.update({
      where: { id: me.roomId },
      data: { groupBankName, groupAccountNumber },
    });
    return NextResponse.json({ room });
  }

  // 같은 방 상대방 (푸시 알림 대상)
  const findOther = () =>
    prisma.user.findFirst({
      where: { roomId: me.roomId, id: { not: userId } },
      include: { subscriptions: true },
    });

  // ── 일시정지 요청 ─────────────────────────────────────────────
  if (action === "request-pause") {
    const weeks = Number(body.weeks);
    if (!weeks || weeks < 1 || weeks > 8) {
      return NextResponse.json({ error: "1~8주 사이로 선택해주세요" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return NextResponse.json({ error: "쉬어가려는 사유를 입력해주세요" }, { status: 400 });
    }
    // 이번 주(오늘 포함)부터 N주 쉬고 그다음 월요일부터 다시 시작.
    // 예: 금요일에 2주 요청 -> 이번 주 + 다음 주를 쉬고 다다음 주 월요일부터 재개
    const pauseRequestedUntil = new Date(getWeekStart().getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
    await prisma.room.update({
      where: { id: me.roomId },
      data: { pauseRequestedBy: userId, pauseRequestedUntil, pauseReason: reason },
    });

    const other = await findOther();
    if (other) {
      await sendPushToUser(other, {
        title: "쉬어가기 요청 도착",
        body: `${me.name} - ${weeks}주 쉬어가도 될지 확인해주세요`,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel-pause") {
    // 요청 취소 OR 진행 중인 정지 취소 — 양쪽 모두 가능
    const before = await prisma.room.findUnique({ where: { id: me.roomId } });
    await prisma.room.update({
      where: { id: me.roomId },
      data: {
        pauseRequestedBy: null,
        pauseRequestedUntil: null,
        pauseReason: null,
        pausedUntil: null,
      },
    });

    // 상대방 요청을 거절했거나, 진행 중인 정지를 취소한 경우에만 알림 (내가 낸 요청을 스스로 취소한 건 조용히)
    const rejected = before?.pauseRequestedBy && before.pauseRequestedBy !== userId && !before.pausedUntil;
    const stoppedActive = !!before?.pausedUntil;
    if (rejected || stoppedActive) {
      const other = await findOther();
      if (other) {
        await sendPushToUser(other, {
          title: rejected ? "쉬어가기 요청 거절" : "쉬어가기 취소",
          body: rejected
            ? `${me.name}님이 쉬어가기 요청을 거절했어요`
            : `${me.name}님이 쉬어가기를 취소했어요. 다시 시작이에요!`,
        });
      }
    }
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

    const other = await findOther();
    if (other && room.pauseRequestedUntil) {
      await sendPushToUser(other, {
        title: "쉬어가기 수락!",
        body: `${me.name}님이 수락했어요. ${formatResumeDate(room.pauseRequestedUntil)}부터 다시 시작해요`,
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 액션이에요" }, { status: 400 });
}
