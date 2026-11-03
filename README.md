# MinLab AI Office

여러 AI에 개발 업무를 나누고 요청·승인·검토를 관리하는 개인용 도트 사무실 웹앱. React + Vite + TypeScript, Supabase, Cloudflare Pages를 사용한다. 추가 결제 없이 규칙·무료 등급·기존 구독을 활용한다.

[문서 안내](docs/README.md) · [현재 흐름](docs/FLOW.md) · [현재 상태](docs/STATUS.md)

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

업무 승인 흐름은 [FLOW](docs/FLOW.md)를 참고한다.

### 그림 바꾸기

`src/assets/office/` 아래에 파일을 넣으면 코드로 그린 도트 대신 그 그림을 쓴다.

```
src/assets/office/background.webp        (또는 .png, 가로:세로 = 300:224, 예: 1200×896)
src/assets/office/characters/<id>-stand.png
src/assets/office/characters/<id>-walk.png  (없으면 stand만 쓰고 살짝 들썩인다)
```

`<id>`: `mina`, `claude`, `codex`, `grok`, `studioA`, `studioB`, `ci`. Grok·Codex·CI 봇·Claude는 받은 그림 그대로, 미니엉·Studio A·Studio B는 받은 그림의 머리·옷 색만 바꿔 만들었다(미니엉←Claude, Studio A←Grok, Studio B←Codex). 그림이 없는 캐릭터는 코드 도트로 그린다. 자리 좌표는 `src/office/layout.ts`에 있다.

## 2. GitHub 저장소

이 저장소는 비공개다. .env.local은 커밋하지 않는다. PR의 verify가 타입·시험·빌드를 검사하며 운영은 release 브랜치만 배포한다. 작업 규칙은 [CLAUDE.md](CLAUDE.md) 참조.

## 3. Supabase 연결

1. 무료 프로젝트를 만들고 supabase/migrations의 SQL을 번호 순서로 적용한다.
2. Auth에 소유자 계정을 만들고 공개 회원가입을 끈다. VITE_ALLOW_SIGNUP=false 유지.
3. .env.example을 .env.local로 복사해 VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY를 넣는다. 비밀 서버 키는 넣지 않는다.
4. 필요한 Edge Functions와 서버 secrets를 설정하고 개발 서버를 다시 켠다. 운영 반영은 소유자 승인 뒤에 한다.

실제 운영 반영 상태는 [STATUS](docs/STATUS.md)에서 확인하며 구현 여부와 구분한다. 데모 프로젝트는 실제 저장소 연결이 아니다. 프로젝트 저장소는 owner/repo 형식으로 등록한다.

## 4. Claude 루틴 연결

PM·보조 개발 루틴의 저장 프롬프트·네트워크 허용·서버 설정은 [루틴 안내](docs/CLAUDE_ROUTINE.md)를 참고한다. 토큰은 Supabase Secrets에만 넣는다. 세션 생성은 완료가 아니며 전송 실패 뒤에는 기존 세션을 확인한 후 재시도한다.

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
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = Supabase 프로젝트의 publishable key
   - `NODE_VERSION` = `22`  (Vite 7은 Node 20.19 이상 필요)
4. Save and Deploy. 끝나면 `https://<이름>.pages.dev` 주소가 생긴다.
5. 브랜치마다 미리보기 사이트가 생기지 않게: Settings → Builds → Branch control → Preview branches를 **None**으로.

배포(승인 후): 앱에서 C 승인을 누르면 서버가 `release`를 `main`으로 앞당긴다(fast-forward만, `release`가 갈라져 있으면 거절). 토큰 `GITHUB_REPO_TOKEN`에 그 저장소의 **Contents: Read and write** 권한이 필요하다.
직접 할 때는 로컬에서 `git fetch origin && git push origin origin/main:refs/heads/release`. 되돌리기는 별도 승인과 절차로 진행한다.

- 반드시 로그인과 Supabase RLS를 쓴다. **GitHub가 Private이어도 웹사이트는 공개다.**
- 관리자용 AI Office와 친구에게 공개할 프로젝트 사이트는 분리한다.

## 6. 요금·권한 원칙

- **추가 API 비용 0원**: Gemini는 무료 API, Claude는 Pro 구독(루틴), ChatGPT·Codex는 Plus 구독 안에서만. 유료 API·크레딧 자동 충전 금지.
- 화면의 사용량 숫자는 이 오피스에 **등록된 실행 횟수**다(하루 상한: Claude 실행 20, Gemini 질문 40·기획 20·견본 10 등). 공급자의 잔여 토큰이 아니다.
- 분류·배정·알림·멈춤 감지는 LLM 호출 없이 규칙으로 한다.
- Codex 자동 시작은 공식 경로가 없어(구독용 서버 인증 없음) 수동 인계다. 결정: Codex for Linear 절충안(`docs/archive/CODEX_LINEAR_DECISION_2026-10-30.md`).
- GitHub 업로드는 올리기 승인 뒤에만, 병합·운영 배포는 배포 승인 뒤에만. 비밀값은 Supabase secrets에만 둔다.
- Supabase Free의 비활동 정지, GitHub Actions·Cloudflare 무료 한도를 확인한다.

남은 작업·검증은 [현재 상태](docs/STATUS.md)를 참고한다.
