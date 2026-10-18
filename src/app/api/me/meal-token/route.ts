import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 아이폰 단축어용 개인 토큰을 새로 만든다. 다시 만들면 이전 토큰은 바로 못 쓰게 된다
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const token = crypto.randomBytes(24).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { mealToken: token } });
  return NextResponse.json({ token });
}
