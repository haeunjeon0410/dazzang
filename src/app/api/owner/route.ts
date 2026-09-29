import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 나 혼자만 쓰는 전용 화면용. 여러 방(친구별로)을 한번에 보기 위한 것으로,
// 코드를 아는 사람만 쓸 수 있게 서버에서도 다시 확인한다.
const OWNER_CODE = "000000";

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  if (code !== OWNER_CODE) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rooms = await prisma.room.findMany({
    include: { users: { select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  // 각 방에서 가장 먼저 들어온 사람(=방 만든 사람인 나)만 로그인 가능하게 하고,
  // 나머지는 이름만 보여준다 (실수로 친구 계정으로 로그인하는 걸 방지)
  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      inviteToken: r.inviteToken,
      me: r.users[0] ? { id: r.users[0].id, name: r.users[0].name } : null,
      others: r.users.slice(1).map((u) => u.name),
    })),
  });
}
