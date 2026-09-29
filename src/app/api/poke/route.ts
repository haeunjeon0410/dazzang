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
  "오늘도 운동이랑 밀당 중?",
  "나는 했는데… 👀",
  "운동하기로 한 거… 기억은 나지?",
  "오늘도 운동을 내일로 보내실 건가요?",
  "슬슬 인증샷 올라올 때 됐는데?",
  "아직 기회는 있어! 아직은!",
  "벌금 낼 준비는 되셨고?",
  "이번 주도 나만 부자 되는 거야?",
  "어라? 모임통장에 또 입금할 거야?",
  "오늘도 모임통장에 기부하시나요?",
  "모임통장이 너 기다리고 있대 💸",
  "덕분에 모임통장이 든든해지고 있어요",
  "잠깐… 벌금 적립할 준비 됐어?",
  "모임통장 잔액이 또 기대되네요 👀",
  "친구야... 혹시... 까먹었어...?",
  "운동한 흔적을 찾는 중… 🔍",
  "기록아… 어디 있니…?",
  "음… 기록이 안 보이네?",
  "오늘도 조용하네? 👀",
  "운동 버튼이 너 기다리는 중…",
  "아직도야?",
  "이 메시지를 본 김에 운동하고 오기 😏",
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
