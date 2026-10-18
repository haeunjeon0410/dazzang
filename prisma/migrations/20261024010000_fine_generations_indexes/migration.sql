-- 벌금 금액을 바꿀 때 바뀌기 전 금액을 남겨, 바뀌는 다음 주 전까지는 이전 금액이 그대로 적용되게 한다
ALTER TABLE "LabFineRule" ADD COLUMN "prevAmount" INTEGER,
ADD COLUMN "prevSinceWeek" TIMESTAMP(3);

-- 인증/식단/사정 조회가 사람·주 기준으로 많이 일어난다 (사진 데이터가 든 큰 테이블이라 인덱스가 없으면 전체를 훑는다)
CREATE INDEX "Checkin_userId_weekStart_idx" ON "Checkin"("userId", "weekStart");
CREATE INDEX "Checkin_userId_createdAt_idx" ON "Checkin"("userId", "createdAt");
CREATE INDEX "Excuse_userId_weekStart_idx" ON "Excuse"("userId", "weekStart");
