import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart } from "@/lib/week";

// 몸무게 기록은 본인만 읽을 수 있다. 방 친구에게 내려가는 어떤 API에도 이 값을 넣지 않는다.
// 기록은 직접 입력하지 않는다: 인증하기/단축어로 올린 체중계 사진을 서버가 읽고(/api/meals), 사용자가 맞다고 확인하면(/api/weight/confirm) 기록된다.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const logs = await prisma.weightLog.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take: 5,
    select: { weekStart: true, kg: true },
  });
  const done = logs.length > 0 && logs[0].weekStart.getTime() === getWeekStart().getTime();
  return NextResponse.json({
    enabled: true,
    thisWeekDone: done,
    // 최신순
    logs: logs.map((l) => ({ weekStart: l.weekStart.toISOString(), kg: l.kg })),
  });
}
