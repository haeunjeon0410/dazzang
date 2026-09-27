import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToSubscriptions } from "@/lib/push";
import { getWeekStart, isWeekFinalized } from "@/lib/week";

// 이번 주에 내가 보낸 요청 + 상대방이 나에게 보낸 요청(내가 허락/거절해야 할 것) 조회
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const weekStart = getWeekStart();
  const excuses = await prisma.excuse.findMany({
    where: { weekStart, user: { roomId: me.roomId } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    mine: excuses.filter((e) => e.userId === userId),
    incoming: excuses.filter((e) => e.userId !== userId),
  });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { reason } = await req.json();
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return NextResponse.json({ error: "사정을 입력해주세요" }, { status: 400 });
  }

  const weekStart = getWeekStart();
  if (isWeekFinalized(weekStart)) {
    return NextResponse.json({ error: "이미 마감된 주입니다" }, { status: 400 });
  }

  const requester = await prisma.user.findUnique({ where: { id: userId } });
  if (!requester) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const excuse = await prisma.excuse.create({
    data: { userId, weekStart, reason: reason.trim() },
  });

  const other = await prisma.user.findFirst({
    where: { roomId: requester.roomId, id: { not: userId } },
    include: { subscriptions: true },
  });
  if (other) {
    await sendPushToSubscriptions(other.subscriptions, {
      title: "사정 봐달라기 요청 도착",
      body: `${requester.name}: "${excuse.reason}" - 허락할지 확인해주세요`,
    });
  }

  return NextResponse.json({ excuse });
}
