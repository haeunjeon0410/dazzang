import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart } from "@/lib/week";
import { verifyWeight } from "@/lib/weight-token";
import { linkedUserIds } from "@/lib/meal-link";

// 사진에서 읽은 몸무게를 사용자가 맞다고 확인하면 이번 주 몸무게로 기록한다.
// 서버가 사진을 읽고 서명해 준 토큰으로만 기록되고, 숫자를 직접 보낼 수는 없다
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kg = verifyWeight(body?.token, userId);
  if (kg === null) return NextResponse.json({ error: "확인 시간이 지났어요. 사진을 다시 올려 주세요" }, { status: 400 });

  const weekStart = getWeekStart();
  // 같은 사람의 다른 방 계정(linkGroup)에도 똑같이 기록한다. 안 그러면 다른 방에서는 계속 인증하라고 뜬다
  const ids = [userId, ...(await linkedUserIds(userId))];
  await Promise.all(
    ids.map((id) =>
      prisma.weightLog.upsert({
        where: { userId_weekStart: { userId: id, weekStart } },
        create: { userId: id, weekStart, kg },
        update: { kg },
      }),
    ),
  );
  return NextResponse.json({ ok: true, kg });
}
