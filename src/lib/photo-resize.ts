import sharp from "sharp";

// 단축어가 보내는 사진은 원본 크기(수 MB)라 AI 게이트웨이가 거절하거나 느려질 수 있다.
// 앱이 올리기 전에 줄이는 것과 같게 긴 변 1280px, JPEG로 줄인다 (회전 정보는 반영하고, 줄이지 못하면 원본 그대로 돌려준다)
export async function shrinkPhoto(image: Buffer): Promise<{ data: Buffer; mimeType: "image/jpeg" } | null> {
  try {
    const data = await sharp(image)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    return { data, mimeType: "image/jpeg" };
  } catch (e) {
    console.error("[meal] resize", e instanceof Error ? e.message : e);
    return null;
  }
}
