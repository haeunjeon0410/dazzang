import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "구독 정보가 올바르지 않습니다" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true });
}

// 알림 끄기: 이 기기의 구독을 지운다
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { endpoint } = await req.json().catch(() => ({}));
  if (!endpoint || typeof endpoint !== "string") {
    return NextResponse.json({ error: "구독 정보가 올바르지 않습니다" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return NextResponse.json({ ok: true });
}
