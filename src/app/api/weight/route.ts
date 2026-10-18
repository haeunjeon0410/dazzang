import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getWeekStart } from "@/lib/week";
import { validKg } from "@/lib/weight-ai";

// 몸무게 기록은 본인만 읽을 수 있다. 방 친구에게 내려가는 어떤 API에도 이 값을 넣지 않는다.
async function loadMine(userId: string) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { labWeight: true, weightAge: true, weightHeight: true, weightSetup: true },
  });
  if (!me?.labWeight) return null;
  const logs = await prisma.weightLog.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take: 5,
    select: { weekStart: true, kg: true },
  });
  const done = logs.length > 0 && logs[0].weekStart.getTime() === getWeekStart().getTime();
  return {
    enabled: true,
    setup: me.weightSetup,
    age: me.weightAge,
    heightCm: me.weightHeight,
    thisWeekDone: done,
    // 최신순
    logs: logs.map((l) => ({ weekStart: l.weekStart.toISOString(), kg: l.kg })),
  };
}

const empty = (v: unknown) => v === null || v === undefined || v === "";

async function saveThisWeek(userId: string, kg: number) {
  const weekStart = getWeekStart();
  await prisma.weightLog.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    create: { userId, weekStart, kg },
    update: { kg },
  });
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const data = await loadMine(userId);
  return NextResponse.json(data ?? { enabled: false });
}

// action: "setup" (나이/키/몸무게 저장) | "skip" (기본 정보 입력 건너뛰기)
// 몸무게는 처음 기본 정보를 적을 때만 직접 입력할 수 있다. 그 뒤로는 체중계 사진 인증(/api/weight/read, 인증하기, 단축어)으로만 기록된다
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { labWeight: true, weightSetup: true } });
  if (!me?.labWeight) return NextResponse.json({ error: "실험실에서 몸무게 인증을 먼저 켜 주세요" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "skip") {
    await prisma.user.update({ where: { id: userId }, data: { weightSetup: true } });
    return NextResponse.json(await loadMine(userId));
  }

  if (action === "setup") {
    const age = empty(body.age) ? null : Number(body.age);
    const height = empty(body.heightCm) ? null : Number(body.heightCm);
    if (age !== null && (!Number.isInteger(age) || age < 5 || age > 120)) {
      return NextResponse.json({ error: "나이를 다시 확인해 주세요" }, { status: 400 });
    }
    if (height !== null && (!Number.isFinite(height) || height < 80 || height > 250)) {
      return NextResponse.json({ error: "키를 다시 확인해 주세요 (cm)" }, { status: 400 });
    }
    const kg = empty(body.kg) ? null : validKg(Number(body.kg));
    if (!empty(body.kg) && kg === null) {
      return NextResponse.json({ error: "몸무게를 다시 확인해 주세요 (kg)" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { weightAge: age, weightHeight: height, weightSetup: true },
    });
    // 직접 입력은 처음 한 번만. 이미 기본 정보를 마쳤으면 몸무게는 받지 않는다
    if (kg !== null && !me.weightSetup) await saveThisWeek(userId, kg);
    return NextResponse.json(await loadMine(userId));
  }

  return NextResponse.json({ error: "요청 형식이 올바르지 않아요" }, { status: 400 });
}
