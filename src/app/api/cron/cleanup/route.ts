import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getWeekStart } from "@/lib/week";

// 매일 03:00 UTC (= 12:00 KST) 실행
// 지난 주 이전의 인증 사진(base64)을 지운다. 지난 주 사진은 볼 수 있는 화면이 없고, 정산(월요일 오전 9시)도 끝났다.
// 레코드(횟수, 이름, 음식별 칼로리)는 보존
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const thisWeek = getWeekStart();

  const { count } = await prisma.checkin.updateMany({
    where: {
      weekStart: { lt: thisWeek },
      photoUrl: { not: "" }, // 이미 지워진 건 스킵
    },
    data: { photoUrl: "" },
  });

  // 식단 사진(base64)도 같은 기준으로 지운다. 하루는 오전 6시에 바뀌므로 주도 월요일 06:00 KST에 바뀐다
  const mealCutoff = new Date(thisWeek.getTime() + 6 * 60 * 60 * 1000);
  const meals = await prisma.meal.updateMany({
    where: { createdAt: { lt: mealCutoff }, photoUrl: { not: "" } },
    data: { photoUrl: "" },
  });

  return NextResponse.json({ ok: true, cleaned: count, cleanedMeals: meals.count });
}
