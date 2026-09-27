import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 벌금 이체를 실제로 완료했는지 자기신고로 체크하는 용도 (자동 이체는 불가능)
export async function POST(req: NextRequest) {
  const requesterId = await getSessionUserId();
  if (!requesterId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { weekStart, userId, settled } = await req.json();
  if (!weekStart || !userId) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const [requester, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: requesterId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!requester || !target || requester.roomId !== target.roomId) {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 403 });
  }

  const result = await prisma.settlement.upsert({
    where: { weekStart_userId: { weekStart: new Date(weekStart), userId } },
    update: { settled: !!settled, settledAt: settled ? new Date() : null },
    create: {
      weekStart: new Date(weekStart),
      userId,
      settled: !!settled,
      settledAt: settled ? new Date() : null,
    },
  });

  return NextResponse.json({ settlement: result });
}
