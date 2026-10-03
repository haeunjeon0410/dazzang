import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDayRange } from "@/lib/week";

// 외부 앱(uh-money)이 읽는 전용 API. 한 사람의 "운동 인증한 날"만 돌려주는 읽기 전용이고,
// 다짱의 다른 기능에는 영향이 없다. EXTERNAL_TOKEN이 설정돼 있어야 열린다.
// 하루는 오전 6시 기준(getDayRange)이라 그날의 시작 시각(UTC)을 키로 돌려준다.
// 사정 봐달라기(Excuse)는 인증이 아니라 벌금 사면이라 일부러 포함하지 않는다.
export async function GET(req: NextRequest) {
  const token = process.env.EXTERNAL_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  const since = new Date(req.nextUrl.searchParams.get("since") ?? "");
  if (!userId || Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "userId와 since(ISO 시각)가 필요합니다" }, { status: 400 });
  }

  const checkins = await prisma.checkin.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // 하루 1장만 인정하지만, 같은 날을 두 번 세지 않게 한 번 더 걸러낸다
  const days = [...new Set(checkins.map((c) => getDayRange(c.createdAt).start.toISOString()))];
  return NextResponse.json({ days });
}
