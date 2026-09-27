const sharp = require("sharp");
const path = require("path");

// argv: src out radiusPx
const [, , srcArg, outArg, radiusArg] = process.argv;
const SRC = path.resolve(srcArg);
const OUT = path.resolve(outArg);
const RADIUS = Number(radiusArg || 3);

(async () => {
  const meta = await sharp(SRC).metadata();
  const { width, height } = meta;

  // 알파 채널을 순수 흑백 실루엣(불투명=255)으로 하드 threshold (블러 없이, 그라데이션 안 번지게)
  const alpha = await sharp(SRC).ensureAlpha().extractChannel(3).raw().toBuffer();
  const hardMask = Buffer.from(alpha.map((v) => (v > 10 ? 255 : 0)));

  const maskWhiteRGBA = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(hardMask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  // 8방향으로 정확히 RADIUS픽셀만큼 실루엣을 겹쳐 그려서 얇고 균일한 테두리를 만든다 (블러 없음)
  const dirs = [];
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    dirs.push({ left: Math.round(Math.cos(angle) * RADIUS), top: Math.round(Math.sin(angle) * RADIUS) });
  }

  let canvas = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });

  const composites = dirs.map(({ left, top }) => ({
    input: maskWhiteRGBA,
    left,
    top,
    // extract 방식 대신 canvas 크기를 넘는 offset은 sharp가 잘라서 처리 못하므로 clamp
  }));

  // sharp composite는 음수 left/top을 지원하지 않으므로, 캔버스를 여유있게 크게 만들고 중앙에 배치
  const pad = RADIUS + 2;
  const bigW = width + pad * 2;
  const bigH = height + pad * 2;

  let big = sharp({
    create: { width: bigW, height: bigH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(
    dirs.map(({ left, top }) => ({ input: maskWhiteRGBA, left: pad + left, top: pad + top })),
  );

  const outlineLayer = await big.png().toBuffer();

  await sharp(outlineLayer)
    .composite([{ input: SRC, left: pad, top: pad }])
    .extract({ left: pad, top: pad, width, height })
    .toFile(OUT);

  console.log("saved", OUT);
})();
