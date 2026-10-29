import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { CAPTION_MAX_LEN } from "@/lib/captions";
import { getWeekStart } from "@/lib/week";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ user: null });

  // 서로 상관없는 조회는 한꺼번에 보낸다 (DB가 멀리 있어서 하나씩 기다리면 느리다).
  // 친구도 내 방 기준으로 같이 찾아서 내 정보를 기다리지 않는다
  const [user, other, weekWeights, pendingMeals] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { room: true, rests: true } }),
    prisma.user.findFirst({
      where: { room: { users: { some: { id: userId } } }, id: { not: userId } },
      include: { rests: true },
    }),
    prisma.weightLog.count({ where: { userId, weekStart: getWeekStart() } }),
    prisma.meal.count({ where: { userId, confirmed: false } }),
  ]);
  if (!user) return NextResponse.json({ user: null });

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
      // 이번 주 몸무게 인증(체중계 사진)을 아직 안 했는지 (홈 배너용). 식단/몸무게 인증은 모두에게 기본 기능이고, 친구가 들어온 방에서만 띄운다
      weightPending: !!other && weekWeights === 0,
      mealToken: user.mealToken,
      // 아이폰으로 올려서 아직 확인하지 않은 식단 수 (식단 탭 숫자 표시용)
      pendingMeals,
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
        }
      : null,
  });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { name, caption } = await req.json().catch(() => ({}));

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
  if (name.trim().length > 20) {
    return NextResponse.json({ error: "이름은 20자까지 쓸 수 있어요" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
  });

  return NextResponse.json({ user: updated });
}
