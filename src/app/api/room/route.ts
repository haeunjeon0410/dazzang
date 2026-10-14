import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { getWeekStart, formatResumeDate, formatPauseEnd } from "@/lib/week";

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
    const current = await prisma.room.findUnique({ where: { id: me.roomId } });
    if (current?.pausedUntil && current.pausedUntil > new Date()) {
      return NextResponse.json({ error: "이미 쉬어가는 중이에요" }, { status: 400 });
    }
    if (current?.pauseRequestedBy && current.pauseRequestedBy !== userId) {
      return NextResponse.json({ error: "친구가 보낸 쉬어가기 요청에 먼저 답해주세요" }, { status: 400 });
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
        body: `친구에게서 쉬어가기 요청이 왔어요 (${weeks}주)`,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel-pause") {
    // 대기 중인 요청의 취소/거절만 가능. 쉬어가기는 시작되면 취소할 수 없다
    const before = await prisma.room.findUnique({ where: { id: me.roomId } });
    if (before?.pausedUntil && before.pausedUntil > new Date()) {
      return NextResponse.json({ error: "쉬어가기는 시작되면 취소할 수 없어요" }, { status: 400 });
    }
    await prisma.room.update({
      where: { id: me.roomId },
      data: {
        pauseRequestedBy: null,
        pauseRequestedUntil: null,
        pauseReason: null,
        pausedUntil: null,
      },
    });

    // 상대방 요청을 거절한 경우에만 알림 (내가 낸 요청을 스스로 취소한 건 조용히)
    const rejected = !!before?.pauseRequestedBy && before.pauseRequestedBy !== userId;

    // "나라도 지킨다": 거절해도 요청한 친구는 그 기간 벌금이 없다 (나는 계속 도전, 친구만 쉼)
    // body.exempt === false (X 버튼): 요청 자체를 거절 -> 둘 다 그대로 진행, 면제 없음
    const exempt = body.exempt !== false;
    if (rejected && exempt && before?.pauseRequestedBy && before.pauseRequestedUntil) {
      await prisma.userRest.create({
        data: { userId: before.pauseRequestedBy, fromWeek: getWeekStart(), untilWeek: before.pauseRequestedUntil },
      });
    }

    if (rejected) {
      const other = await findOther();
      if (other) {
        await sendPushToUser(other, {
          title: "쉬어가기 요청 거절",
          body: exempt
            ? `${me.name}님은 계속 도전해요. 대신 ${before?.pauseRequestedUntil ? `~ ${formatPauseEnd(before.pauseRequestedUntil)}까지 ` : ""}벌금은 없어요`
            : `${me.name}님이 쉬어가기 요청을 거절했어요. 둘 다 계속 도전해요`,
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
    // 요청 후 시간이 지나 이미 끝난 기간이면 수락할 수 없다 (요청을 정리)
    if (!room.pauseRequestedUntil || room.pauseRequestedUntil <= getWeekStart()) {
      await prisma.room.update({
        where: { id: me.roomId },
        data: { pauseRequestedBy: null, pauseRequestedUntil: null, pauseReason: null },
      });
      return NextResponse.json({ error: "요청한 기간이 이미 지나서 만료됐어요. 다시 요청해달라고 해주세요" }, { status: 400 });
    }
    // 더블 탭 등으로 두 번 처리되지 않도록 아직 같은 요청이 남아 있을 때만 확정
    const confirmed = await prisma.room.updateMany({
      where: { id: me.roomId, pauseRequestedBy: room.pauseRequestedBy },
      data: {
        pausedUntil: room.pauseRequestedUntil,
        pauseRequestedBy: null,
        pauseRequestedUntil: null,
      },
    });
    if (confirmed.count === 0) return NextResponse.json({ ok: true });
    // 이번 주부터 재개 월요일 전까지를 정지 이력으로 남긴다
    if (room.pauseRequestedUntil) {
      await prisma.roomPause.create({
        data: { roomId: me.roomId, fromWeek: getWeekStart(), untilWeek: room.pauseRequestedUntil },
      });
    }

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
