import { prisma } from "@/lib/prisma";
import { getWeekStart, getDayRange } from "@/lib/week";
import { checkThisWeek } from "@/lib/photo-date";

// 운동 인증 한 장을 저장한다 (앱과 아이폰 동작 버튼이 같이 쓴다).
// 사진에 찍힌 촬영 시각(EXIF)으로 인증하고, 이번 주에 찍은 사진만 받는다. 촬영 정보가 없으면 지금으로 인정한다.
// 같은 사람의 다른 방 계정(linkGroup이 같은 계정)에도 똑같이 인증하고, 하루 1장만 인정해서 같은 날 올린 게 있으면 새로 올린 걸로 교체한다
export async function createCheckin(
  userId: string,
  photoDataUrl: string,
  takenAt: unknown,
): Promise<{ ok: true; checkin: { id: string; createdAt: Date } } | { ok: false; error: string; status: number }> {
  const now = new Date();
  const shotAt = typeof takenAt === "string" ? new Date(takenAt) : now;
  const dateCheck = checkThisWeek(takenAt);
  if (!dateCheck.ok) return { ok: false, error: dateCheck.error, status: 400 };

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return { ok: false, error: "로그인이 필요합니다", status: 401 };
  const linked = me.linkGroup
    ? await prisma.user.findMany({ where: { linkGroup: me.linkGroup, id: { not: userId } }, select: { id: true } })
    : [];
  const targetIds = [userId, ...linked.map((u) => u.id)];

  // createdAt = 촬영 시각 → 캘린더 요일 칸, 하루 1장 규칙이 모두 찍은 날 기준으로 동작
  const weekStart = getWeekStart(now);
  const { start, end } = getDayRange(shotAt);
  const [, ...created] = await prisma.$transaction([
    prisma.checkin.deleteMany({ where: { userId: { in: targetIds }, createdAt: { gte: start, lte: end } } }),
    ...targetIds.map((id) =>
      prisma.checkin.create({ data: { userId: id, photoUrl: photoDataUrl, weekStart, createdAt: shotAt } }),
    ),
  ]);
  return { ok: true, checkin: { id: created[0].id, createdAt: created[0].createdAt } };
}
