import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { CAPTION_MAX_LEN } from "@/lib/captions";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ user: null });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { room: true, rests: true } });
  if (!user) return NextResponse.json({ user: null });

  const other = await prisma.user.findFirst({
    where: { roomId: user.roomId, id: { not: userId } },
    include: { rests: true },
  });

  // 지금 진행 중인(끝나지 않은) 혼자 쉬는 기간 중 가장 늦게 끝나는 것
  const now = new Date();
  const restUntil = user.rests
    .filter((r) => r.fromWeek <= now && r.untilWeek > now)
    .map((r) => r.untilWeek)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      caption: user.captions[0] ?? "",
      restUntil: restUntil?.toISOString() ?? null,
      labMeal: user.labMeal,
      labWeight: user.labWeight,
      labDismissed: user.labDismissed,
      mealToken: user.labMeal ? user.mealToken : null,
      // 아이폰으로 올려서 아직 확인하지 않은 식단 수 (식단 탭 숫자 표시용)
      pendingMeals: user.labMeal ? await prisma.meal.count({ where: { userId: user.id, confirmed: false } }) : 0,
    },
    room: {
      inviteToken: user.room.inviteToken,
      full: !!other,
      groupBankName: user.room.groupBankName,
      groupAccountNumber: user.room.groupAccountNumber,
      groupAccountHolder: user.room.groupAccountHolder,
      deleteRequestedBy: user.room.deleteRequestedBy,
      pauseRequestedBy: user.room.pauseRequestedBy,
      pauseRequestedUntil: user.room.pauseRequestedUntil,
      pauseReason: user.room.pauseReason,
      pausedUntil: user.room.pausedUntil,
    },
    other: other
      ? {
          id: other.id,
          name: other.name,
          caption: other.captions[0] ?? "",
          resting: other.rests.some((r) => r.fromWeek <= now && r.untilWeek > now),
          // 친구가 켠 실험실 기능 (켰는지만 알려주고 기록은 내려보내지 않는다). "같이 할래요?" 팝업용
          labMeal: other.labMeal,
          labWeight: other.labWeight,
        }
      : null,
  });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { name, caption, labMeal, labWeight, dismissLab } = await req.json();

  // 친구가 켠 실험실 기능에 "같이 하기"를 거절했다는 표시
  if (dismissLab !== undefined) {
    if (dismissLab !== "meal" && dismissLab !== "weight") {
      return NextResponse.json({ error: "형식이 올바르지 않아요" }, { status: 400 });
    }
    const cur = await prisma.user.findUnique({ where: { id: userId }, select: { labDismissed: true } });
    if (cur && !cur.labDismissed.includes(dismissLab)) {
      await prisma.user.update({ where: { id: userId }, data: { labDismissed: [...cur.labDismissed, dismissLab] } });
    }
    return NextResponse.json({ ok: true });
  }

  // 실험실 몸무게 인증 켜기/끄기 (끄면 입력창만 사라지고 기록은 남는다)
  if (labWeight !== undefined) {
    if (typeof labWeight !== "boolean") {
      return NextResponse.json({ error: "형식이 올바르지 않아요" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { labWeight } });
    return NextResponse.json({ ok: true });
  }

  // 실험실 식단 인증 켜기/끄기
  if (labMeal !== undefined) {
    if (typeof labMeal !== "boolean") {
      return NextResponse.json({ error: "형식이 올바르지 않아요" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { labMeal } });
    return NextResponse.json({ ok: true });
  }

  // 말풍선 멘트 수정 (User.captions[0]에 하나만 저장, 비우면 인증 횟수별 기본 멘트)
  if (caption !== undefined) {
    if (typeof caption !== "string") {
      return NextResponse.json({ error: "멘트 형식이 올바르지 않아요" }, { status: 400 });
    }
    const trimmed = caption.trim();
    if (trimmed.length > CAPTION_MAX_LEN) {
      return NextResponse.json({ error: `멘트는 ${CAPTION_MAX_LEN}자까지 쓸 수 있어요` }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { captions: trimmed ? [trimmed] : [] } });
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
