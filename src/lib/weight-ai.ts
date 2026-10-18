// 몸무게 숫자 검사. 체중계 사진은 meal-ai의 사진 분석이 식단/운동 판별과 함께 읽는다.
// 사람 몸무게로 말이 되는 값만 받는다 (소수점 한 자리로 맞춘다)
export function validKg(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const kg = Math.round(v * 10) / 10;
  return kg >= 20 && kg <= 300 ? kg : null;
}
