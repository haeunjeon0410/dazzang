import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { getWeekStart } from "@/lib/week";
import { LAB_FEATURES, FINE_CHOICES, type LabFeature } from "@/lib/lab-fine";

const NAMES: Record<LabFeature, string> = { weight: "몸무게 인증" };

// 방 두 사람이 합의하는 실험실 벌금 약속. 한쪽이 금액을 제안하고 상대가 수락하면 다음 주부터 적용된다
async function snapshot(roomId: string, meId: string) {
  const rows = await prisma.labFineRule.findMany({ where: { roomId } });
  return {
    choices: FINE_CHOICES,
    rules: LAB_FEATURES.map((feature) => {
      const r = rows.find((x) => x.feature === feature);
      return {
        feature,
        amount: r?.amount ?? 0,
        sinceWeek: r?.sinceWeek ?? null,
        // 대기 중인 제안: 내가 보낸 것(mine)인지, 친구가 보낸 것인지
        proposedAmount: r?.proposedAmount ?? null,
        proposedByMe: r?.proposedBy ? r.proposedBy === meId : false,
      };
    }),
  };
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { roomId: true } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  return NextResponse.json(await snapshot(me.roomId, userId));
}

// action: "propose" (feature, amount) | "respond" (feature, accept) | "cancel" (feature, 내가 보낸 제안 취소)
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const feature = body?.feature as LabFeature;
  if (!LAB_FEATURES.includes(feature)) return NextResponse.json({ error: "요청 형식이 올바르지 않아요" }, { status: 400 });

  // 합의는 두 사람이 모두 그 기능을 켠 방에서만 할 수 있다
  const other = await prisma.user.findFirst({
    where: { roomId: me.roomId, id: { not: userId } },
    include: { subscriptions: true },
  });
  const isOn = (u: { labWeight: boolean }) => u.labWeight;
  if (!other) return NextResponse.json({ error: "친구가 들어온 뒤에 정할 수 있어요" }, { status: 400 });
  if (!isOn(me) || !isOn(other)) {
    return NextResponse.json({ error: "두 사람 모두 이 기능을 켜야 벌금을 정할 수 있어요" }, { status: 400 });
  }

  const where = { roomId_feature: { roomId: me.roomId, feature } };
  const rule = await prisma.labFineRule.findUnique({ where });

  if (body.action === "propose") {
    const amount = Number(body.amount);
    if (!FINE_CHOICES.includes(amount)) return NextResponse.json({ error: "금액을 다시 골라 주세요" }, { status: 400 });
    if (rule?.proposedBy && rule.proposedBy !== userId) {
      return NextResponse.json({ error: "친구가 보낸 제안에 먼저 답해 주세요" }, { status: 400 });
    }
    if ((rule?.amount ?? 0) === amount) return NextResponse.json({ error: "지금 약속과 같은 금액이에요" }, { status: 400 });
    await prisma.labFineRule.upsert({
      where,
      create: { roomId: me.roomId, feature, proposedAmount: amount, proposedBy: userId },
      update: { proposedAmount: amount, proposedBy: userId },
    });
    await sendPushToUser(other, {
      title: `${NAMES[feature]} 벌금 제안`,
      body: amount > 0 ? `${me.name}님이 ${NAMES[feature]} 벌금 ${amount.toLocaleString()}원을 제안했어요` : `${me.name}님이 ${NAMES[feature]} 벌금을 없애자고 제안했어요`,
    }).catch(() => {});
    return NextResponse.json(await snapshot(me.roomId, userId));
  }

  if (body.action === "respond") {
    if (!rule?.proposedBy || rule.proposedAmount === null) {
      return NextResponse.json({ error: "답할 제안이 없어요" }, { status: 400 });
    }
    if (rule.proposedBy === userId) {
      return NextResponse.json({ error: "내가 보낸 제안에는 내가 답할 수 없어요" }, { status: 400 });
    }
    if (body.accept === true) {
      // 합의한 다음 주부터 적용 (이미 지나간 주나 진행 중인 주에는 갑자기 벌금이 생기지 않는다)
      const sinceWeek = new Date(getWeekStart().getTime() + 7 * 24 * 60 * 60 * 1000);
      await prisma.labFineRule.update({
        where,
        data: { amount: rule.proposedAmount, sinceWeek, proposedAmount: null, proposedBy: null },
      });
    } else {
      await prisma.labFineRule.update({ where, data: { proposedAmount: null, proposedBy: null } });
    }
    return NextResponse.json(await snapshot(me.roomId, userId));
  }

  if (body.action === "cancel") {
    if (rule?.proposedBy === userId) {
      await prisma.labFineRule.update({ where, data: { proposedAmount: null, proposedBy: null } });
    }
    return NextResponse.json(await snapshot(me.roomId, userId));
  }

  return NextResponse.json({ error: "요청 형식이 올바르지 않아요" }, { status: 400 });
}
