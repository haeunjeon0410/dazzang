import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 매주 일요일 03:00 UTC (= 12:00 KST) 실행
// 30일 지난 체크인 사진(base64)만 지우고, 레코드(횟수)는 보존
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const authorized =
    secret === process.env.CRON_SECRET ||
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { count } = await prisma.checkin.updateMany({
    where: {
      createdAt: { lt: cutoff },
      photoUrl: { not: "" }, // 이미 지워진 건 스킵
    },
    data: { photoUrl: "" },
  });

  return NextResponse.json({ ok: true, cleaned: count });
}
