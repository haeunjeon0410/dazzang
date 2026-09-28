import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

// 방 코드만 알면 아무나 남의 이름을 눌러서 들어갈 수 있던 문제 방지용 PIN 체크.
// 처음 가입할 때 PIN을 안 만든 예전 계정은 여기서 처음 입력한 값이 그대로 PIN으로 등록된다.
export async function POST(req: NextRequest) {
  const { userId, pin } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: "누구인지 선택해주세요" }, { status: 400 });
  }
  if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "4자리 PIN을 입력해주세요" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }

  if (user.pin === null) {
    await prisma.user.update({ where: { id: user.id }, data: { pin } });
  } else if (user.pin !== pin) {
    return NextResponse.json({ error: "PIN이 틀렸어요" }, { status: 403 });
  }

  await setSession(user.id);
  return NextResponse.json({ id: user.id, name: user.name });
}
