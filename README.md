# MinLab AI Office v0.4.11

> **목표** — MinLab AI Office는 여러 AI(ChatGPT·Claude·Codex·Gemini·Grok)에게 내 요청에 맞는 일을 효율적으로 나눠 맡기고, 각 AI의 토큰·사용량은 최소로 쓰도록 관리하는 개인 AI 개발팀 사무실이다.
>
> - **사용자가 하는 일은 질문(요청), 승인, 결과 검토·수정 요청뿐이다.** 나머지 손작업은 무료·구독 안에서 하나씩 자동으로 바꾼다.
> - AI를 안 써도 되는 일(분류·상태 질문·배정·프로젝트 확인·알림)은 규칙으로 한다(토큰 0).
> - AI는 사용자의 행동(접수 확인·승인·수정 요청·버튼)이 있을 때만 쓴다. 같은 일을 두 번 시키지 않는다.
> - 싼 길부터: 규칙 → 무료(Gemini) → 구독 안 수동 인계(ChatGPT는 중요한 기획만·Codex) → 구독 자동(Claude PM·보조 개발). 유료 API는 쓰지 않는다.
> - 하루 상한과 실제 사용 기록을 화면에 보여 준다. 공급자의 남은 토큰은 알 수 없으므로 횟수로 관리한다.

개인 AI 개발팀을 운영하는 **2D 도트 사무실형 작업 관리 웹앱**. PC를 모두 꺼도 휴대폰만으로 요청 → 승인 → 개발 → 결과 확인 → 배포까지 할 수 있게 만든다. 흐름 기준 문서는 `docs/FLOW_v0.3_2026-10-30.md`, 변경 기록은 `CHANGELOG.md`.

## 0. 실행

### 0-1. PC에서 처음 실행 (Windows 명령 프롬프트, cmd)

Node.js 20.19 이상(또는 22.12 이상)과 Git이 설치되어 있어야 한다. 버전은 `node -v`로 확인한다.

```cmd
git clone https://github.com/minho-nim/MinLab-AI-Office.git
cd MinLab-AI-Office

REM .env.local 만들기 (비워두면 로컬 데모 모드)
echo VITE_SUPABASE_URL=> .env.local
echo VITE_SUPABASE_PUBLISHABLE_KEY=>> .env.local
echo VITE_ALLOW_SIGNUP=false>> .env.local

npm install
npm run dev
```

- Supabase를 연결하려면 `.env.local`의 `VITE_SUPABASE_URL=`, `VITE_SUPABASE_PUBLISHABLE_KEY=` 뒤에 값을 채운다(3장 참고). `.env.local`은 커밋하지 않는다.
- 브라우저에서 `http://localhost:5173`을 연다. 종료는 `Ctrl+C`.

### 0-2. PowerShell에서

Windows PowerShell에서:

```powershell
cd C:\path\to\minlab-ai-office
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 연다. `.env.local`이 없으면 **로컬 데모 모드**로 동작하고, 업무는 그 기기 브라우저의 localStorage에만 저장된다. 모바일과 두 PC 사이의 공유는 되지 않는다.

```powershell
npm run typecheck
npm test
npm run build
```

`npm run build:artifact`는 Claude 안에서 바로 열 수 있는 단일 HTML(`dist-artifact/index.html`)을 만든다. 항상 로컬 데모 모드다.

## 1. 오피스 화면 규칙

| 공간 | 들어가는 업무 | 사는 캐릭터 |
| --- | --- | --- |
| 리서치실 | 리서치 | Grok |
| 개발실 | 개발 | Codex |
| 터미널실 · CI | 검수·QA | CI 봇 |
| 기획실 | 기획·설계, UI·디자인, 프로토타입 | Claude, Studio A, Studio B |
| 휴게실 | 열린 업무가 없을 때 | 모두 |
| 복도 | 접수·검토 대기·차단 메모(대기열), 접수 매니저 미니엉 | 미니엉 |

- 위치와 말풍선은 **업무 상태만** 따른다. 꾸며낸 활동은 없다.
  - 진행 중: 그 업무 유형의 방 책상. 자기 방이 아니면 그 방 빈자리에서 *도와주는 중*.
  - 차단·검토 대기·접수만 있음: 자기 방에서 대기.
  - 열린 업무 없음: 휴게실에서 *휴식 중*.
- 방 사이는 문 → 복도 → 문으로 천천히 걷는다(걷는 그림으로 바뀜). 진행 중일 때만 살짝 흔들린다.
- 실제 진행 중인 자리만 모니터가 켜지고, 차단된 업무가 있으면 터미널실 경고등이 켜진다.
- 머리 위 말풍선은 **업무 종류[상태]**: **?** 내 차례(승인·답) · **…** 진행 중 · **!** 막힘(멈춤 포함) · 표시 없음 = 대기·휴식. 캐릭터를 누르면 "표시 이름 / 뜻 / 업무"가 나오고, ? 가 있으면 업무 카드로 간다(`src/office/speech.ts`).
- 업무 탭 맨 위 **내 차례**에 내가 손댈 일만 모인다. 기획 승인·올리기 승인은 목록에서 바로, 나머지는 [보기]. 오래 안 넘어가는 단계는 [!]로 알린다(`src/domain/myTurn.ts`, `stall.ts`).

### 업무 흐름 (v0.4, 업무 카드 → 진행 단계)

| 단계 | 하는 일 | 사람 / 자동 |
| --- | --- | --- |
| 0. 입력창 | 상태 질문은 규칙이 바로 답, 일반 질문은 Gemini가 답(GPT로 이어서 묻기), 개발 요청은 "이 프로젝트 맞아요?" 확인 후 접수 | 요청·확인 |
| 1. 기획 | 접수하면 Gemini(무료)가 사진을 먼저 보고 기획서 초안 작성. 확인 질문은 입력창에 답하면 다시 씀. 중요한 업무는 ChatGPT로 기획(수동) | 자동 |
| 2. **기획 승인** | 기획서 승인 또는 수정 요청(Gemini가 다시 씀) | 사람 |
| 3. 계획 | Claude PM이 작업을 나누고 담당·개발 방식(견본 먼저 / 바로 개발)을 정해 계획을 자동으로 보냄 | 자동 |
| 3-1. 견본 | 견본 먼저면 Gemini가 HTML 견본 한 장을 만들어 올림 → **견본 승인** | 자동 + 사람 |
| 4. **실행 승인** | 작업마다 승인. Claude 작업은 승인하면 바로 시작, Codex는 지시서를 넘겨 시작(Linear 연동 예정) | 사람 (+Codex 수동) |
| 5. 결과 | Claude는 결과(요약·바뀐 파일·diff·시험 결과)를 자동으로 보냄. Codex 결과는 붙여넣기 | 자동 / 수동 |
| 6. **올리기 승인** | 결과 검토 → 승인하면 Claude가 승인된 diff 그대로 PR을 엶(병합 없음), 앱이 PR·CI를 자동 확인. 또는 수정 요청(PM 재계획) | 사람 |
| 7. **배포 승인** | CI 성공 확인 뒤 승인 → 서버가 확인한 커밋 그대로 병합하고 `release`를 앞당김(`deploy-release`) | 사람 |

첨부는 Supabase 비공개 버킷 `attachments`(이미지·문서 20MB, HTML·SVG는 앱 안에서만 미리보기). 링크는 서버 함수 `fetch-link`가 한 번 읽는다(내부망 차단). 승인·기획서·결과는 지울 수 없는 기록이고 순서는 DB 트리거가 다시 확인한다.

### 그림 바꾸기

`src/assets/office/` 아래에 파일을 넣으면 코드로 그린 도트 대신 그 그림을 쓴다.

```
src/assets/office/background.webp        (또는 .png, 가로:세로 = 300:224, 예: 1200×896)
src/assets/office/characters/<id>-stand.png
src/assets/office/characters/<id>-walk.png  (없으면 stand만 쓰고 살짝 들썩인다)
```

`<id>`: `mina`, `claude`, `codex`, `grok`, `studioA`, `studioB`, `ci`. Grok·Codex·CI 봇·Claude는 받은 그림 그대로, 미니엉·Studio A·Studio B는 받은 그림의 머리·옷 색만 바꿔 만들었다(미니엉←Claude, Studio A←Grok, Studio B←Codex). 그림이 없는 캐릭터는 코드 도트로 그린다. 자리 좌표는 `src/office/layout.ts`에 있다.

## 2. GitHub 저장소

1. GitHub에 `MinLab-AI-Office` **Private** 저장소를 만든다.
2. 이 소스를 올린다. `.env.local`과 비밀키는 절대 올리지 않는다(`.gitignore`에 포함).
3. `.github/workflows/verify.yml`이 PR마다 타입 검사, 테스트, 빌드를 돌린다. 배포·병합은 하지 않는다.
4. `main`에 자동 푸시·병합하지 않는다.

## 3. Supabase Free 연결 (PC 간 동기화에 추천)

> 연결 완료: 프로젝트 `minlab-ai-office`(서울, ref `kmmicksimbredbyvdmvx`)에 마이그레이션 0001·0002와 `dispatch-claude` 함수를 적용했다.
> `.env.local`에는 아래 두 값을 넣으면 된다(공개용 값).
> `VITE_SUPABASE_URL=https://kmmicksimbredbyvdmvx.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_wHxWdPU9k3QTQ55RXdFJhw_wpCHydqA`
> 남은 일: 소유자 로그인 계정 만들기, 공개 회원가입 끄기, Edge Function secrets 입력(아래 4장).

처음부터 새로 만들 때:

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 무료 프로젝트를 만든다.
2. `supabase/migrations/0001_office.sql`을 SQL Editor에서 실행한다.
3. Auth에서 소유자 이메일/비밀번호 계정을 만든다. **공개 회원가입은 끄고**, 앱의 `VITE_ALLOW_SIGNUP=false`를 유지한다.
4. `.env.example`을 `.env.local`로 복사하고 채운다.

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_VALUE
```

5. 개발 서버를 다시 켜고 로그인한다. 다른 기기에서도 같은 계정으로 로그인하면 15초마다 업무를 다시 불러온다.

데모의 `MinLab / MuscleMap / Crossroads` 프로젝트는 실제 저장소와 연결된 것이 아니다(화면에 "예시" 표시). Supabase 모드에서는 프로젝트를 새로 등록하고, GitHub 저장소는 `owner/repo` 형식으로 입력한다.

## 4. Claude Code Cloud Routines 연결 (v0.1 확장 기능)

**공식 문서상 연구 프리뷰이며 API 형태가 바뀔 수 있다.** 이 연결만으로 Codex·Grok·AI Studio가 자동 실행되지는 않는다.

1. Claude Pro 계정에서 [Claude Routines](https://claude.ai/code/routines)로 간다.
2. GitHub 저장소에 접근할 수 있는 Cloud Routine 하나를 **API trigger**로 만든다.
3. 저장 프롬프트는 `docs/CLAUDE_ROUTINE.md`를 쓴다. 사용자가 보낸 `<routine-fire-payload>`를 읽도록 적혀 있다.
4. `Fire URL`과 한 번만 보이는 `Bearer token`을 복사한다. **브라우저 코드나 Git 저장소에 넣지 않는다.**
5. Supabase CLI로 `supabase/functions/dispatch-claude`를 배포하고 secrets를 **Supabase 서버 쪽**에 등록한다.

```
CLAUDE_ROUTINE_FIRE_URL     = 루틴 Fire URL
CLAUDE_ROUTINE_TOKEN        = 루틴 Bearer token
CLAUDE_ALLOWED_REPOSITORY   = owner/MinLab-AI-Office   # 루틴에 연결된 저장소와 같아야 함
OFFICE_OWNER_EMAIL          = 소유자 로그인 이메일      # 이 계정만 실행 가능
CLAUDE_DAILY_CAP            = 20                      # 선택. 코드 상한 20회를 넘지 않음(루틴 한도 시간당 30회)
CLAUDE_ROUTINE_BETA         =                         # 선택. 루틴 화면이 요구하는 anthropic-beta 헤더 값
OFFICE_ALLOWED_ORIGIN       = https://your-office.pages.dev  # 선택. CORS 허용 주소
```

6. 함수에서 기본값 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 쓸 수 있는지 확인한다.
7. 오피스에서 Claude에게 배정된 업무를 만들고, 프로젝트 저장소가 허용 저장소와 같은지 확인한 뒤 **Claude Cloud 실제 실행**을 누른다.
8. 돌아온 세션 링크에서 진행 상황을 본다. 401, 429, 시간 초과는 업무를 **차단**으로 남기고 오류를 보여준다. 다시 실행하려면 *Routines History에서 이전 실행이 없었음을 확인했다*는 체크가 필요하다. 실패한 실행도 한도에 1회로 센다(실제로 실행됐을 수 있으므로).

루틴 하나는 연결된 저장소만 작업한다. 함수는 실수로 다른 저장소를 건드리지 않게 **허용 저장소 하나**로 제한되어 있다(v0.1의 의도된 제한).

## 5. Cloudflare Pages 배포 (모바일·다른 PC에서 접속)

**배포 규칙:** Cloudflare는 `release` 브랜치만 운영 배포한다. `main`에 병합해도 사이트는 바뀌지 않는다. 소유자가 승인하면 `release`를 `main`과 같게 맞추고, 그때 배포된다.

처음 한 번 연결:
1. [Cloudflare 대시보드](https://dash.cloudflare.com) → Workers & Pages → Create → **Pages** → **Connect to Git** → GitHub 권한 승인 → `minho-nim/MinLab-AI-Office` 선택
2. 빌드 설정
   - Production branch: **`release`**
   - Framework preset: Vite (또는 None)
   - Build command `npm run build`, Build output directory `dist`
3. Environment variables (Production)
   - `VITE_SUPABASE_URL` = `https://kmmicksimbredbyvdmvx.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = 3장의 publishable key
   - `NODE_VERSION` = `22`  (Vite 7은 Node 20.19 이상 필요)
4. Save and Deploy. 끝나면 `https://<이름>.pages.dev` 주소가 생긴다.
5. 브랜치마다 미리보기 사이트가 생기지 않게: Settings → Builds → Branch control → Preview branches를 **None**으로.

배포(승인 후): 앱에서 C 승인을 누르면 서버가 `release`를 `main`으로 앞당긴다(fast-forward만, `release`가 갈라져 있으면 거절). 토큰 `GITHUB_REPO_TOKEN`에 그 저장소의 **Contents: Read and write** 권한이 필요하다.
직접 할 때는 로컬에서 `git fetch origin && git push origin origin/main:refs/heads/release`. 되돌릴 때는 이전 커밋으로 같은 명령을 쓴다(서버는 되돌리지 않는다).

- 반드시 로그인과 Supabase RLS를 쓴다. **GitHub가 Private이어도 웹사이트는 공개다.**
- 관리자용 AI Office와 친구에게 공개할 프로젝트 사이트는 분리한다.

## 6. 요금·권한 원칙

- **추가 API 비용 0원**: Gemini는 무료 API, Claude는 Pro 구독(루틴), ChatGPT·Codex는 Plus 구독 안에서만. 유료 API·크레딧 자동 충전 금지.
- 화면의 사용량 숫자는 이 오피스에 **등록된 실행 횟수**다(하루 상한: Claude 실행 20, Gemini 질문 40·기획 20·견본 10 등). 공급자의 잔여 토큰이 아니다.
- 분류·배정·알림·멈춤 감지는 LLM 호출 없이 규칙으로 한다.
- Codex 자동 시작은 공식 경로가 없어(구독용 서버 인증 없음) 수동 인계다. 결정: Codex for Linear 절충안(`docs/CODEX_LINEAR_DECISION_2026-10-30.md`).
- GitHub 업로드는 올리기 승인 뒤에만, 병합·운영 배포는 배포 승인 뒤에만. 비밀값은 Supabase secrets에만 둔다.
- Supabase Free의 비활동 정지, GitHub Actions·Cloudflare 무료 한도를 확인한다.

## 7. 다음에 할 것

- Codex for Linear 연결(소유자 Linear 설정 뒤): Codex 시작·진행 상황 자동 확인
- 첫 실제 업무로 Claude 자동 흐름(결과 보내기·PR·서버 병합) 운영 확인
- 사무실 표시 규칙 다듬기, 개발일지 올리기(올릴 곳 정해지면)

정책과 구조는 `docs/ARCHITECTURE.md`, 요구사항은 `docs/REQUIREMENTS.md`.

글꼴: 갈무리(Galmuri11 Bold, SIL OFL 1.1, `src/assets/fonts/Galmuri-OFL.md`).

문의: 소유자
