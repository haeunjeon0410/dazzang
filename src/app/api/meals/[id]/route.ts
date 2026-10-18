import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 내가 올린 식단 지우기
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const { id } = await params;
  const { count } = await prisma.meal.deleteMany({ where: { id, userId } });
  if (count === 0) return NextResponse.json({ error: "식단을 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
