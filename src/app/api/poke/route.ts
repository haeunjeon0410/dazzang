import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToSubscriptions } from "@/lib/push";

const POKE_LINES = [
  "나는 했는데, 너는?",
  "숨쉬듯이 미루는 중이신가요?",
  "설마 또 안 하고 자려고?",
  "오늘도 패스하시게요?",
  "어제도 안 하더니 오늘도?",
  "야, 너 오늘 인증샷 어디감?",
  "너 지금 이럴 때가 아닐 텐데?",
  "벌금 낼 준비는 되셨고?",
  "네 벌금이 내 통장을 살찌우고 있어",
  "이번 주도 나만 부자 되는 거야?",
  "지금 이 순간에도 벌금은 쌓이고 있어요",
  "친구야... 혹시... 까먹었어...?",
  "어라? 오늘 것만 없네?",
  "흠... 이상하다? 사진이 안 보이네?",
  "나 혼자 하니까 외로워... 빨리 와",
  "나만 열심히 하는 거 억울해 죽겠어",
  "이번 주 스코어 확인해봤어? 부끄럽지 않아?",
  "3, 2, 1... 아직도야?",
];

// 상대방 캐릭터 콕 찌르기. 랜덤 문구로 살짝 독촉하는 용도
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const other = await prisma.user.findFirst({
    where: { roomId: me.roomId, id: { not: userId } },
    include: { subscriptions: true },
  });
  if (!other) return NextResponse.json({ error: "아직 친구가 없어요" }, { status: 400 });

  const line = POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)];

  await sendPushToSubscriptions(other.subscriptions, {
    title: "콕!",
    body: line,
  });

  return NextResponse.json({ ok: true });
}
