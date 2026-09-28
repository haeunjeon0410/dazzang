# 다짱

친구랑 1:1로 운동 인증 맞짱 뜨는 개인용 웹앱(PWA). 아이폰 사파리에서 "홈 화면에 추가"하면 앱처럼 사용 가능.

## 규칙

- 방(Room) 하나 = 1:1 맞짱. 방장이 방을 만들고 초대 링크를 친구에게 보내면, 친구가 링크로 들어와 닉네임을 정하고 합류
- 친구가 여러 명이면 그만큼 방을 여러 개 만들 수 있음 (각 방은 완전히 독립적으로 인증/벌금 관리)
- 주 3회 인증샷 업로드 (self-report, 타이머 없음), **하루 1장만 인정** — 같은 날 다시 올리면 이전 사진은 자동으로 교체됨
- 매주 월요일 00:00 ~ 일요일 23:59 (KST)이 한 주. **마감 지나면 그 주에 사진 추가 불가 (소급 불가)**
- 마감 시점 기준 3회 미만이면 부족한 횟수 x 5,000원 벌금
- "사정 봐달라기": 부족한 날에 대해 사유 적어서 요청 → 상대방이 허락하면 인증 1회로 인정돼서 벌금 차감
- 벌금 자동 이체는 불가능(오픈뱅킹 API는 개인이 실계좌 이체 권한을 받을 수 없음) → 앱은 "계좌번호 복사 + 은행 앱 열기"까지만 도와주고, 실제 송금은 본인이 마지막에 직접 확인 후 실행

## 최초 설정 (로컬 개발)

1. 의존성 설치
   ```bash
   npm install
   ```
2. `.env` 채우기
   - `DATABASE_URL`: Postgres 연결 문자열 (아래 "배포" 항목에서 만드는 Neon 프로젝트 값을 로컬에서도 그대로 사용하면 됨)
   - `SESSION_SECRET`, `CRON_SECRET`은 아무 랜덤 문자열로 변경
   - 웹푸시 키 생성:
     ```bash
     npx web-push generate-vapid-keys
     ```
     나온 public/private key를 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(=public key와 동일값)에 채워넣기
3. DB 마이그레이션 적용
   ```bash
   npx prisma migrate dev --name init
   ```
4. 로컬 실행
   ```bash
   npm run dev
   ```
5. `http://localhost:3000` 접속 → 닉네임 정하고 "방 만들기" → 뜨는 초대 링크를 친구에게 전달

## 배포 (완전 무료 구성: Vercel + Neon)

인증샷을 base64로 DB에 저장하기 때문에 서버 디스크가 필요 없음 → 서버리스(Vercel)에 그대로 올려도 됨.

1. **DB**: [neon.com](https://neon.com)에서 무료 프로젝트 생성 → Connection string(`postgresql://...`) 복사
2. **배포**: [vercel.com](https://vercel.com)에서 GitHub으로 로그인 → "Add New Project" → `haeunjeon0410/dazzang` 레포 Import
3. Vercel 프로젝트 Settings → Environment Variables에 아래 값 등록 (Production/Preview/Development 전부 체크):
   - `DATABASE_URL` = Neon에서 복사한 연결 문자열
   - `SESSION_SECRET`, `CRON_SECRET` = 랜덤 문자열
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = `npx web-push generate-vapid-keys`로 생성한 값
4. Deploy 클릭 → 빌드 중 `prisma migrate deploy`가 자동 실행되어 Neon에 테이블이 생성됨
5. 마감 리마인드(토요일 저녁 KST)와 결과 확정(월요일 00:05 KST)은 `vercel.json`에 등록된 Vercel Cron이 자동으로 호출함 (별도 설정 불필요)
6. 완료되면 `https://프로젝트명.vercel.app` 주소를 아이폰 사파리에서 열어 "홈 화면에 추가"

## 사용법

1. 방장이 앱 접속 → 닉네임 정하고 "방 만들기"
2. "초대 링크 공유하기"로 친구에게 링크 전달 (카톡 등)
3. 친구가 링크 접속 → 닉네임 정하고 참여
4. 각자 "마감 알림 받기"로 푸시 허용
5. 운동 후 "오늘 인증하기"로 사진 업로드
6. "기록" 탭에서 주차별 결과 확인, 벌금 낸 사람은 본인이 직접 "정산완료" 체크
7. 여러 친구랑 하고 싶으면 "내정보" 탭에서 로그아웃 후 새 방을 또 만들면 됨
