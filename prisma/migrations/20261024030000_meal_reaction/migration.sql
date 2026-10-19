-- 식단 사진에 상대방이 고른 이모티콘 반응 (운동 인증샷의 Checkin.reaction과 같은 방식)
ALTER TABLE "Meal" ADD COLUMN "reaction" TEXT;
