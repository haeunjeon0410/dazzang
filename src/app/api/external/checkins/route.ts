import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDayRange } from "@/lib/week";
import { isExternalAuthorized } from "@/lib/external-auth";

// 외부 앱(mypt)이 운동 인증 사진을 읽는 전용 API. 읽기 전용이고 EXTERNAL_TOKEN이 있어야 열린다.
// 하루 1장만 인정하는 다짱 규칙에 맞게, 날(오전 6시 기준)마다 가장 최근 인증 한 장만 돌려준다.
export async function GET(req: NextRequest) {
  if (!isExternalAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userIds = (req.nextUrl.searchParams.get("userId") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const since = new Date(req.nextUrl.searchParams.get("since") ?? "");
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 5, 1), 10);
  if (userIds.length === 0 || Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "userId와 since(ISO 시각)가 필요합니다" }, { status: 400 });
  }

  const checkins = await prisma.checkin.findMany({
    where: { userId: { in: userIds }, createdAt: { gte: since } },
    select: { id: true, createdAt: true, photoUrl: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 40,
  });

  // 방이 둘이면 같은 인증이 두 번 저장되어 있어서, 날짜로 묶어 한 장만 남긴다
  const byDay = new Map<string, (typeof checkins)[number]>();
  for (const c of checkins) {
    const key = getDayRange(c.createdAt).start.toISOString();
    if (!byDay.has(key)) byDay.set(key, c);
  }
  return NextResponse.json({
    checkins: [...byDay.values()].slice(0, limit).map((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      photoUrl: c.photoUrl,
    })),
  });
}
