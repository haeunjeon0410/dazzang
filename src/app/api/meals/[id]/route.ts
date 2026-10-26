import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { parseMealInput } from "@/lib/meal-input";
import { linkedUserIds } from "@/lib/meal-link";

// 내가 올린 식단 고치기. 단축어로 올라온 확인 대기 초안을 확인(저장)할 때도 쓴다.
// 같은 사람의 다른 방 계정(linkGroup)에 똑같이 올라간 같은 식단도 함께 고친다
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { id } = await params;
  const input = parseMealInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "음식 이름을 적어 주세요" }, { status: 400 });
  const meal = await prisma.meal.findFirst({ where: { id, userId }, select: { createdAt: true } });
  if (!meal) return NextResponse.json({ error: "식단을 찾을 수 없습니다" }, { status: 404 });
  const mates = await linkedUserIds(userId);
  await prisma.meal.updateMany({
    where: { OR: [{ id, userId }, { userId: { in: mates }, createdAt: meal.createdAt }] },
    data: { title: input.title, kcal: input.kcal, items: input.items, fraction: input.fraction, confirmed: true },
  });
  return NextResponse.json({ ok: true, title: input.title, kcal: input.kcal });
}

// 내가 올린 식단 지우기. 다른 방 계정에 똑같이 올라간 식단도 함께 지운다
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { id } = await params;
  const meal = await prisma.meal.findFirst({ where: { id, userId }, select: { createdAt: true } });
  if (!meal) return NextResponse.json({ error: "식단을 찾을 수 없습니다" }, { status: 404 });
  const mates = await linkedUserIds(userId);
  await prisma.meal.deleteMany({
    where: { OR: [{ id, userId }, { userId: { in: mates }, createdAt: meal.createdAt }] },
  });
  return NextResponse.json({ ok: true });
}
