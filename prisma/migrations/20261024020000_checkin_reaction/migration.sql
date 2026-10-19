-- 인증샷에 상대방이 고른 이모티콘 반응 (liked는 예전 하트 호환용으로 그대로 둔다)
ALTER TABLE "Checkin" ADD COLUMN "reaction" TEXT;
