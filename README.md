# MinLab AI Office v0.2.9

개인 AI 개발팀을 운영하는 **2D 도트 사무실형 작업 관리 웹앱**. 회사 Windows PC, 집 PC, 모바일에서 프로젝트와 업무를 보고, 지원되는 Claude Code Cloud Routines 실행을 지시할 수 있다. 다른 AI는 *연동 확인 전까지* 수동 인계만 제공한다.

> v0.1 구현 범위: 도트 오피스(리서치실·개발실·터미널실·기획실·휴게실 + 복도 대기열), 7명의 AI 캐릭터, 프로젝트 CRUD, 업무 CRUD, 규칙 기반 자동 배정, 상태 전이·사용량 정책, 지시서 복사, Supabase 인증/저장·폴링, Claude Cloud HTTP 트리거용 Edge Function, GitHub CI.
> **실제 배포, 실제 Claude 호출, Codex/Grok 무인 실행은 아직 설정·검증하지 않았다.**

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
| 복도 | 접수·검토 대기·차단 메모(대기열), 접수 매니저 미나 | 미나 |

- 위치와 말풍선은 **업무 상태만** 따른다. 꾸며낸 활동은 없다.
  - 진행 중: 그 업무 유형의 방 책상. 자기 방이 아니면 그 방 빈자리에서 *도와주는 중*.
  - 차단·검토 대기·접수만 있음: 자기 방에서 대기.
  - 열린 업무 없음: 휴게실에서 *휴식 중*.
- 방 사이는 문 → 복도 → 문으로 천천히 걷는다(걷는 그림으로 바뀜). 진행 중일 때만 살짝 흔들린다.
- 실제 진행 중인 자리만 모니터가 켜지고, 차단된 업무가 있으면 터미널실 경고등이 켜진다.
- 캐릭터를 누르면 `[작업 중]` `[도와주는 중]` `[휴식 중]` 말풍선과 상세 패널이 열린다.

### v0.2.1 업무 플로우 (업무 카드 → 진행 단계)

| 단계 | 하는 일 | 자동? |
| --- | --- | --- |
| 0. 입력창 | 묻거나 시킬 일을 쓰면 규칙이 나눈다. 상태 질문은 바로 답, 작업 요청은 "이 프로젝트 맞아요?" 확인 후 업무로 접수, 일반 질문은 Gemini(버튼)·ChatGPT 복사 | 규칙 + 선택 |
| 1. 기획 | (선택) 요청 자료 이미지 첨부·링크 읽기 → "ChatGPT용 자료 복사" → ChatGPT에서 기획(이미지는 대화에 직접 첨부) → 결과(의도·프롬프트·범위·유지 조건·테스트) 저장 | 수동 인계 |
| 2. **A** | 기획서 버전 승인, 또는 **수정 요청(ChatGPT로)** → 재기획. 기획서를 고치면 이전 승인은 무효 | — |
| 3. PM | "Claude PM에 전달" → 세션의 JSON 계획을 붙여넣기 → 검증 후 저장 | 세션 시작은 자동, 계획 회수는 수동 |
| 4. **E** | 작업마다 실행 승인. Codex 자동 시작은 미검증이라 버튼이 꺼져 있고, 수동 인계(지시서 복사 → Codex 웹에서 시작 → "직접 시작했어요") | 수동 인계 |
| 5. 결과·**B** | diff·테스트 로그·스크린샷으로 결과 패키지 저장 → 검토 → **수정 요청(Claude PM으로)** 또는 B 승인. B 승인 후에만 PR | — |
| 6. **C** | PR CI 통과·병합 확인 → C 승인 → `release` 갱신 명령 | — |

이미지는 Supabase 비공개 버킷 `attachments`에 저장된다(파일 하나 5MB, 요청 10장·결과 6장, 합계 900MB). 요청 자료는 A 승인 뒤 잠기고, 결과 스크린샷은 추가만 된다. 이미지는 "Gemini로 분석"을 누르면 서버 함수 `analyze-image`가 Gemini 무료 API로 분석해 ChatGPT 자료에 넣는다(원본을 대신하지 않음, 하루 20회).

링크는 서버 함수 `fetch-link`가 한 번 읽는다(내부망 차단, 8초·1MB, 하루 30회). 읽은 내용은 신뢰할 수 없는 참고자료로 표시해 ChatGPT 자료에 넣는다. ChatGPT의 확인 질문과 답은 업무 카드에 기록하면 다음 자료에 함께 들어간다.

승인·기획서·결과는 지울 수 없는 기록이고, 순서는 DB가 다시 확인한다. 검증 기록은 `docs/CLOUD_CODEX_DISPATCH_VERIFICATION_2026-10-29.md`, `docs/CLOUD_FEASIBILITY_2026-10-29.md`.

### 그림 바꾸기

`src/assets/office/` 아래에 파일을 넣으면 코드로 그린 도트 대신 그 그림을 쓴다.

```
src/assets/office/background.webp        (또는 .png, 가로:세로 = 300:224, 예: 1200×896)
src/assets/office/characters/<id>-stand.png
src/assets/office/characters/<id>-walk.png  (없으면 stand만 쓰고 살짝 들썩인다)
```

`<id>`: `mina`, `claude`, `codex`, `grok`, `studioA`, `studioB`, `ci`. Grok·Codex·CI 봇·Claude는 받은 그림 그대로, 미나·Studio A·Studio B는 받은 그림의 머리·옷 색만 바꿔 만들었다(미나←Claude, Studio A←Grok, Studio B←Codex). 그림이 없는 캐릭터는 코드 도트로 그린다. 자리 좌표는 `src/office/layout.ts`에 있다.

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

배포(승인 후): 로컬에서 `git fetch origin && git push origin origin/main:refs/heads/release`. 되돌릴 때는 이전 커밋으로 같은 명령을 쓴다.

- 반드시 로그인과 Supabase RLS를 쓴다. **GitHub가 Private이어도 웹사이트는 공개다.**
- 관리자용 AI Office와 친구에게 공개할 프로젝트 사이트는 분리한다.

## 6. 요금·권한 원칙

- **추가 API 비용 0원**: ChatGPT/Claude Pro 외 요금, 크레딧 자동 충전 금지.
- Claude Routines는 Claude Pro 사용량을 쓴다. 사용량이 없으면 차단된다.
- 화면의 사용량 숫자는 이 오피스에 **등록된 실행 횟수**다(Claude Cloud 실행, 수동 에이전트는 "진행 시작" 시 1회). 공급자의 잔여 토큰이 아니다.
- 업무 접수와 자동 배정은 LLM 호출 없이 규칙으로 한다.
- Codex·Grok·AI Studio는 무인 클라우드 실행이 연결되지 않았다. 지시서 복사만 된다.
- 완료는 *검토 대기 → 완료 승인*으로만 갈 수 있다. 사용자가 승인하기 전에는 `main` 병합·운영 배포를 하지 않는다.
- Supabase Free의 비활동 정지, GitHub Actions·Cloudflare 무료 한도를 확인한다.

## 7. 다음 버전

- **v0.2** GitHub PR 목록·리뷰 코멘트·CI 상태 조회(CI 봇 자동 반영), 시크릿과 소유자 권한 강화
- **v0.3** Claude 완료 상태 자동 반영(공식 이벤트 확인 후), 저장소별 루틴 매핑, 서버 쪽 사용량 정책 수정 UI
- **v0.4** 허용된 Codex/Grok 공식 실행 어댑터 검증, 무료 사용량 보호
- **v0.5** 작업 이벤트 기반 이동 확장, 인계·재시도 개선, PWA
- **v1.0** 읽기 전용 포트폴리오 시연 모드, 검증된 협업 자동화

정책과 구조는 `docs/ARCHITECTURE.md`, 요구사항은 `docs/REQUIREMENTS.md`.

글꼴: 갈무리(Galmuri11 Bold, SIL OFL 1.1, `src/assets/fonts/Galmuri-OFL.md`).
