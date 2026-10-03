// 같은 사람의 여러 방 계정을 하나로 묶는다. 묶인 계정은 한쪽에서 인증하면 다른 쪽에도 똑같이 인증된다.
//
//   node scripts/link-users.js 하은 요요오기직전임           # 조회만 (DB 안 바뀜)
//   node scripts/link-users.js 하은 요요오기직전임 --apply   # 실제로 연결
//   node scripts/link-users.js --unlink 하은 요요오기직전임 --apply   # 연결 해제
//
// 이름이 정확히 한 명씩만 맞을 때만 적용한다 (같은 이름이 여러 명이면 멈춤)
const { PrismaClient } = require("@prisma/client");

process.loadEnvFile?.(".env");

const LINK_GROUP = "owner";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const unlink = args.includes("--unlink");
const names = args.filter((a) => !a.startsWith("--"));

if (names.length < 2) {
  console.log("사용법: node scripts/link-users.js <이름1> <이름2> [--apply] [--unlink]");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const picked = [];
  for (const name of names) {
    const users = await prisma.user.findMany({
      where: { name },
      include: { room: { include: { users: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } } } } },
    });
    console.log(`\n"${name}" → ${users.length}명`);
    for (const u of users) {
      const roomMates = u.room.users.filter((x) => x.id !== u.id).map((x) => x.name).join(", ") || "(혼자)";
      const isCreator = u.room.users[0]?.id === u.id;
      console.log(`  - id=${u.id} | 방 친구: ${roomMates} | ${isCreator ? "방을 만든 사람" : "초대받은 사람"} | 현재 연결: ${u.linkGroup ?? "없음"}`);
    }
    if (users.length !== 1) {
      console.log(`\n중단: "${name}"이(가) 정확히 1명이 아니에요. 이름을 확인해주세요.`);
      process.exit(1);
    }
    picked.push(users[0]);
  }

  const next = unlink ? null : LINK_GROUP;
  console.log(`\n${picked.map((u) => u.name).join(" ↔ ")} ${unlink ? "연결 해제" : "연결"} 대상 ${picked.length}명`);
  if (!apply) {
    console.log("(조회만 했어요. 실제로 적용하려면 --apply 를 붙이세요)");
    return;
  }
  const res = await prisma.user.updateMany({ where: { id: { in: picked.map((u) => u.id) } }, data: { linkGroup: next } });
  console.log(`적용 완료: ${res.count}명`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
