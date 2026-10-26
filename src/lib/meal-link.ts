import { prisma } from "@/lib/prisma";

// 같은 사람의 다른 방 계정(linkGroup이 같은 계정)의 id. 운동 인증처럼 식단도 한쪽에 올리면 양쪽에 똑같이 반영한다.
// 올릴 때 같은 시각(createdAt)으로 만들어서, 고치거나 지울 때 그 시각으로 짝을 찾는다
export async function linkedUserIds(userId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { linkGroup: true } });
  if (!me?.linkGroup) return [];
  const linked = await prisma.user.findMany({ where: { linkGroup: me.linkGroup, id: { not: userId } }, select: { id: true } });
  return linked.map((u) => u.id);
}
