import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { parseMealInput } from "@/lib/meal-input";

// 내가 올린 식단 고치기. 단축어로 올라온 확인 대기 초안을 확인(저장)할 때도 쓴다
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { id } = await params;
  const input = parseMealInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "음식 이름을 적어 주세요" }, { status: 400 });
  const { count } = await prisma.meal.updateMany({
    where: { id, userId },
    data: { title: input.title, kcal: input.kcal, items: input.items, fraction: input.fraction, confirmed: true },
  });
  if (count === 0) return NextResponse.json({ error: "식단을 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 내가 올린 식단 지우기
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { id } = await params;
  const { count } = await prisma.meal.deleteMany({ where: { id, userId } });
  if (count === 0) return NextResponse.json({ error: "식단을 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
