# 식사 알림 (점심/저녁)

앱 **내 정보 → 실험실 → 식사 알림**을 켜고 점심, 저녁 시간을 정하면, 그 시간에 "먹기 전에 식단 한 장 올려 볼까요?" 푸시가 와요.

- 이미 식단(확인 대기 포함)을 90분 안에 올렸으면 알림을 안 보내요.
- 쉬어가기 중이면 안 보내요.
- 같은 알림은 하루에 한 번만 가요.
- 푸시는 앱을 홈 화면에 추가하고 알림을 켠 폰에서만 와요. 식사 알림을 켤 때 알림 권한도 같이 물어봐요.

## 스케줄러 설정 (cron-job.org, 무료)

Vercel 무료 플랜의 크론은 하루 한 번뿐이라, 알림이 정한 시간에 가려면 외부 스케줄러가 `/api/cron/meal-reminder`를 15분마다 불러야 해요.
(`vercel.json`에 15분 크론을 넣으면 무료 플랜에서는 배포가 실패해요.)

| 항목 | 값 |
|---|---|
| Title | 다짱 식사 알림 |
| URL | `https://(배포 주소)/api/cron/meal-reminder` |
| Execution schedule | Every 15 minutes |
| Request method (Advanced) | GET |
| Headers (Advanced) | 이름 `Authorization`, 값 `Bearer (CRON_SECRET 값)` |

저장하고 **Test run**을 눌러 응답이 `200`, 내용이 `{"ok":true,"sent":[]}` 꼴인지 확인하세요.

- 정한 시간에서 최대 15분쯤 늦게 올 수 있어요. 스케줄러가 늦어도 정한 시간부터 30분 안에 불리면 보내요.
- `401`이면 헤더 값이 틀린 거예요. `Bearer ` 뒤에 한 칸 띄우고 `CRON_SECRET`을 그대로 붙여요. `CRON_SECRET`이 Vercel 환경변수에 없으면 항상 `401`이에요.
- `CRON_SECRET`은 비밀번호예요. 저장소나 채팅에 붙이지 말고 Vercel 환경변수와 cron-job.org 헤더에만 넣어요.
