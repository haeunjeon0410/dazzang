import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToSubscriptions } from "@/lib/push";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const { approve } = await req.json();

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const excuse = await prisma.excuse.findUnique({ where: { id }, include: { user: true } });
  if (!excuse) return NextResponse.json({ error: "요청을 찾을 수 없습니다" }, { status: 404 });
  if (excuse.user.roomId !== me.roomId) {
    return NextResponse.json({ error: "요청을 찾을 수 없습니다" }, { status: 404 });
  }
  if (excuse.userId === userId) {
    return NextResponse.json({ error: "본인 요청은 본인이 승인할 수 없습니다" }, { status: 403 });
  }
  if (excuse.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리된 요청입니다" }, { status: 400 });
  }

  const updated = await prisma.excuse.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", resolvedAt: new Date() },
  });

  const requester = await prisma.user.findUnique({ where: { id: excuse.userId }, include: { subscriptions: true } });
  if (requester) {
    await sendPushToSubscriptions(requester.subscriptions, {
      title: approve ? "사정 봐달라기 요청이 허락됐어요" : "사정 봐달라기 요청이 거절됐어요",
      body: excuse.reason,
    });
  }

  return NextResponse.json({ excuse: updated });
}
