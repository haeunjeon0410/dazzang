import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { CAPTION_MAX_LEN } from "@/lib/captions";
import { TIME_RE } from "@/lib/meal-reminder";

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
      mealToken: user.labMeal ? user.mealToken : null,
      mealReminder: user.mealReminder,
      lunchTime: user.lunchTime,
      dinnerTime: user.dinnerTime,
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
        }
      : null,
  });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { name, caption, labMeal, mealReminder, lunchTime, dinnerTime } = await req.json();

  // 식사 알림 켜기/끄기와 점심, 저녁 시간 (한 번에 일부만 보내도 된다)
  if (mealReminder !== undefined || lunchTime !== undefined || dinnerTime !== undefined) {
    const data: { mealReminder?: boolean; lunchTime?: string; dinnerTime?: string } = {};
    if (mealReminder !== undefined) {
      if (typeof mealReminder !== "boolean") return NextResponse.json({ error: "형식이 올바르지 않아요" }, { status: 400 });
      data.mealReminder = mealReminder;
    }
    for (const [key, v] of [["lunchTime", lunchTime], ["dinnerTime", dinnerTime]] as const) {
      if (v === undefined) continue;
      if (typeof v !== "string" || !TIME_RE.test(v)) return NextResponse.json({ error: "시간 형식이 올바르지 않아요" }, { status: 400 });
      data[key] = v;
    }
    await prisma.user.update({ where: { id: userId }, data });
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
