import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { EXCUSE_REPLY_MAX_LEN } from "@/lib/excuse";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { id } = await params;
  const { approve, reply } = await req.json().catch(() => ({}));
  // 답장은 선택. 비어 있으면 null로 저장
  if (reply !== undefined && reply !== null && typeof reply !== "string") {
    return NextResponse.json({ error: "답장 형식이 올바르지 않아요" }, { status: 400 });
  }
  const replyText = typeof reply === "string" ? reply.trim() : "";
  if (replyText.length > EXCUSE_REPLY_MAX_LEN) {
    return NextResponse.json({ error: `답장은 ${EXCUSE_REPLY_MAX_LEN}자까지 쓸 수 있어요` }, { status: 400 });
  }

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

  // 허락/거절을 동시에 두 번 눌러도 먼저 들어온 하나만 처리되게, 아직 대기 중일 때만 바꾼다
  const status = approve === true ? "APPROVED" : "REJECTED";
  const updated = await prisma.excuse.updateMany({
    where: { id, status: "PENDING" },
    data: { status, resolvedAt: new Date(), reply: replyText || null },
  });
  if (updated.count === 0) return NextResponse.json({ error: "이미 처리된 요청입니다" }, { status: 400 });

  // 알림이 안 가도 처리는 끝난 것이다
  await sendPushToUser(excuse.user, {
    title: approve === true ? "사정 봐달라하기 요청이 허락됐어요" : "사정 봐달라하기 요청이 거절됐어요",
    body: replyText ? `${me.name}: "${replyText}"` : `친구가 요청을 ${approve === true ? "허락" : "거절"}했어요`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, status });
}
