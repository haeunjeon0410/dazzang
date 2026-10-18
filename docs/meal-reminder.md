# 식사 알림 (점심/저녁)

앱 **내 정보 → 실험실 → 식사 알림**을 켜고 점심, 저녁 시간을 정하면, 그 시간에 "먹기 전에 식단 한 장 올려 볼까요?" 푸시가 와요.

- 이미 식단(확인 대기 포함)을 90분 안에 올렸으면 알림을 안 보내요.
- 쉬어가기 중이면 안 보내요.
- 같은 알림은 하루에 한 번만 가요.
- 푸시는 앱을 홈 화면에 추가하고 알림을 켠 폰에서만 와요. 식사 알림을 켤 때 알림 권한도 같이 물어봐요.

## 스케줄러 (GitHub Actions, 무료)

Vercel 무료 플랜의 크론은 하루 한 번뿐이라, 정한 시간에 알림이 가려면 15분마다 `/api/cron/meal-reminder`를 불러 줄 곳이 필요해요.
(`vercel.json`에 15분 크론을 넣으면 무료 플랜에서는 배포가 실패해요.)

이 저장소의 `.github/workflows/meal-reminder.yml`이 그 일을 해요. 처음에 한 번만 비밀값을 넣어 주세요.

```bash
gh secret set CRON_SECRET --repo haeunjeon0410/dazzang
```

값은 **Vercel 환경변수 `CRON_SECRET`과 똑같은 것**을 붙여 넣어요. (Vercel에 아직 없으면 아무 긴 랜덤 문자열을 정해서 Vercel과 여기 둘 다 넣어요.)

- 확인: 저장소의 **Actions → 식사 알림 → Run workflow**를 누르고 초록색 체크가 뜨면 돼요. 응답은 `{"ok":true,"sent":[]}` 꼴이에요.
- 비밀값이 없으면 워크플로는 실패하지 않고 "건너뛰었어요" 안내만 남겨요.
- 정한 시간부터 최대 45분 안에 불리면 보내요. GitHub 스케줄은 가끔 10분 넘게 늦을 수 있어서, 알림이 몇 분 늦게 올 수 있어요.
- 공개 저장소는 60일 동안 저장소 활동이 없으면 GitHub가 스케줄을 꺼요. 그땐 Actions 화면에서 다시 켜면 돼요.
- `CRON_SECRET`은 비밀번호예요. 저장소나 채팅에 붙이지 말고 Vercel 환경변수와 GitHub 비밀값에만 넣어요.

## 다른 방법 (cron-job.org)

GitHub 대신 cron-job.org에서 같은 주소를 15분마다 불러도 돼요.

| 항목 | 값 |
|---|---|
| URL | `https://dazzang-five.vercel.app/api/cron/meal-reminder` |
| Execution schedule | Every 15 minutes |
| Request method (Advanced) | GET |
| Headers (Advanced) | 이름 `Authorization`, 값 `Bearer (CRON_SECRET 값)` |

`401`이면 헤더 값이 틀린 거예요. `Bearer ` 뒤에 한 칸 띄우고 `CRON_SECRET`을 그대로 붙여요. Vercel에 `CRON_SECRET`이 없으면 항상 `401`이에요.
