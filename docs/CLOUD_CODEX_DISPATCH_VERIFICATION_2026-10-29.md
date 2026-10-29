# Claude PM → Codex Cloud 실행 검증 기록 (2026-10-29, Asia/Seoul)

v0.2.1 지시서 §2.3·§5·§6-7에 따른 기록. **실제 실행 성공**과 **문서·소스 확인만 한 것**과 **시뮬레이션(테스트)**을 구분한다. 비밀값은 적지 않는다.

## 1. 결론 요약

| 경로 | 상태 | 근거 |
| --- | --- | --- |
| Claude Code Routines API 트리거로 PM 세션 시작 | **검증됨(실제 계정)** | 2026-10-29 08:29·08:32 KST에 AI Office → Edge Function → `/fire` 호출, 세션 2개 생성 확인 |
| Routine 세션 결과(PM 계획)를 AI Office로 자동 회수 | **미구현 / 차단** | fire 토큰은 "no read access". 세션 실행 환경에서 `supabase.co` 접속이 네트워크 정책으로 막힘(같은 환경에서 확인). → 사용자가 세션의 JSON을 복사해 붙여넣는다 |
| Codex Cloud 자동 시작(`codex cloud exec`) | **not_verified — 자동 시작 버튼 비활성** | 명령은 공식 소스에 있음. 하지만 인증이 ChatGPT 로그인 전용이고, 꺼지지 않는 독립 실행기와 공식 자동화 인증이 없음 |
| Codex Cloud 결과를 GitHub 푸시 없이 diff로 확인 | **가능(소스 확인), 실제 계정 미실측** | 공식 CLI에 `codex cloud diff TASK_ID`가 있음. Codex 웹의 diff 보기도 같은 용도 |
| Codex Cloud 수동 인계(사용자가 웹에서 시작) | **manual_handoff — 동작** | 앱이 지시서를 만들고, 사용자가 시작을 기록(`status_source=user_reported`) |
| Claude 세션 안에서 Codex CLI 설치·실행 | **한 번도 하지 않음** | 이 세션은 Codex 저장소의 문서·소스 텍스트만 읽었다(바이너리 내려받기·설치·실행 없음) |

## 2. Claude Code Routines `/fire`

- 공식 문서: https://platform.claude.com/docs/en/api/claude-code/routines-fire (2026-10-29 읽음)
- 확인한 내용
  - `POST https://api.anthropic.com/v1/claude_code/routines/{trig_…}/fire`
  - 헤더: `Authorization: Bearer sk-ant-oat01-…`(루틴 전용 토큰), `anthropic-version`(예시 `2026-10-21`, `2023-06-01` 이후 모두 동일 동작), `Content-Type: application/json`. `anthropic-beta: experimental-cc-routine-2026-04-01`는 있어도 없어도 됨.
  - 본문: `{ "text": "…" }` 최대 65,536자, 구조화 파싱 없음.
  - 응답: `{ type: "routine_fire", claude_code_session_id, claude_code_session_url }`. **세션 생성만 뜻하며 완료가 아님.**
  - 오류: 400(헤더·길이·루틴 일시정지), 401, 403, 404, 429(`Retry-After`), 500, 503.
  - 한도: 루틴당 시간당 30회(웹 Run now 포함), 계정당 시간당 100회. 세션은 Claude 구독 사용량을 씀.
  - **멱등 키 없음** → 재시도하면 세션이 또 생긴다.
- 반영한 것
  - Edge Function 헤더를 `anthropic-version: 2026-10-21`로 바꾸고 beta 헤더를 뺐다.
  - 응답은 `claude_code_session_url`만 읽는다.
  - 429·400 안내를 문서 기준으로 고쳤다.
  - 멱등 키가 없으므로 서버가 막는다: `claim_claude_dispatch`가 **A 승인된 최신 기획서 버전마다 한 번**만 예약한다(advisory lock + 상태 조건). 타임아웃은 `failed`로 두고, 사용자가 Routines History를 확인했다고 체크해야 재시도한다.
- 실제 실행 기록(v0.1 경로, 2026-10-29)
  - 08:29:17 KST 업무 "설계 테스트" → 세션 생성, Claude가 요청이 모호해 계획 없이 멈춤(규칙대로)
  - 08:32:35 KST 업무 "README에 PC 실행 방법" → 세션 생성, 당시 루틴 지시(코드 작성·PR)로 PR #6 생성
- v0.2.1 변경: 루틴 저장 프롬프트를 **PM 전용**(저장소 쓰기·푸시·PR 금지, JSON 계획만 출력)으로 교체(2026-10-29 20:31 KST).
- **v0.2.1 경로 실제 실행(2026-10-29 22:48 KST, 검증됨)**: 업무 "README 맨 아래에 '문의: 소유자' 한 줄 추가" → 기획서 v1 저장 → A 승인 → "Claude PM에 전달" → 세션 생성 → 세션의 JSON 계획을 붙여넣어 계획 v1 저장(작업 W1, Codex·수동 인계, `awaiting_user_execution_approval`).
  - 실행 뒤 GitHub 확인: 새 PR·새 브랜치·`main` 새 커밋 **없음**. PM 전용 루틴이 저장소를 건드리지 않았다.
  - 첫 전달은 `CLAUDE_DAILY_CAP` secret이 2로 남아 있어 HTTP 429(일일 상한)로 막혔고, 소유자가 20으로 바꾼 뒤 통과했다(실행 기록에는 성공 1회만 남음).
- 남은 위험
  - 루틴 설정에는 여전히 저장소 쓰기 권한(Edit/Write 도구, 브랜치 결과 설정)이 있다. **프롬프트 규칙으로만 막고 있다.** 루틴 화면에서 쓰기 도구를 끄는 설정이 있는지 사용자가 확인해야 한다.

## 3. Codex Cloud

- 공식 문서 사이트 `developers.openai.com`, `help.openai.com`은 이 세션의 네트워크 허용 목록에 없어 **읽지 못했다**(DNS 차단). 지시서에 적힌 URL은 다음 검증 때 허용 후 다시 확인한다.
- 대신 읽은 것: 공식 저장소 `openai/codex` main `9cc14e7`(2026-10-29) — `codex-rs/cloud-tasks/src/cli.rs`, `lib.rs`(문서·소스 텍스트만)
  - 하위 명령: `exec`(TUI 없이 새 작업 제출), `status TASK_ID`, `list [--env] [--json]`, `apply TASK_ID`, `diff TASK_ID`
  - `exec`: `QUERY`, `--env ENV_ID`(필수), `--attempts 1~4`, `--branch`
  - 인증: `codex login`(ChatGPT 로그인)만 지원. 로그인하지 않으면 "Not signed in. Please run 'codex login' to sign in with ChatGPT". 백엔드는 `chatgpt.com/backend-api`.
- 판단
  - AI Office(Cloudflare 정적 사이트)나 Supabase Edge Function에서는 CLI를 실행할 수 없다.
  - 무인 실행에는 ① 꺼지지 않는 별도 실행기 ② 그 실행기에서 쓸 공식 자동화 인증이 필요하다. ②는 Plus 로그인 파일(`auth.json`)을 복사하는 방식밖에 확인되지 않았고, 지시서가 금지했다. → **보류**.
  - GitHub Actions를 실행기로 쓰면 로그·아티팩트가 GitHub에 남는다. B 승인 전 업로드 금지와 충돌하므로 쓰지 않았다.
  - 이슈 #50182, #56350(새 환경 목록 미표시), #56995(새 환경 생성 HTTP 500)는 GitHub API 접근이 이 세션에 허용되지 않아 **원문을 읽지 못했다**. 재현 여부도 확인하지 못했다(실행기가 없음).
- 사용자 PC에서만 가능한 비파괴 검증 절차(다음 단계, 직접 실행)
  1. Codex CLI 공식 설치 → `codex login`(ChatGPT)
  2. `codex cloud list --json` → 사용할 환경 ID가 보이는지(#50182·#56350 재현 여부)
  3. 읽기 전용 작업 제출: `codex cloud exec --env <ENV_ID> "README의 첫 줄만 읽고 요약해. 파일을 바꾸지 마."`
  4. `codex cloud status <TASK_ID>` → 작업 ID·상태·URL 기록, `codex cloud diff <TASK_ID>` → 빈 diff 확인
  5. 결과(성공·오류 메시지·CLI 버전·날짜)를 이 문서에 추가. 이것은 PC가 켜져 있을 때만 되는 방식이며, PC가 꺼진 상태의 자동 실행 검증이 아니다.

## 4. GitHub 업로드 전 검토

| 질문 | 답 |
| --- | --- |
| Codex 결과를 푸시·PR 없이 볼 수 있나 | 예. Codex 웹 diff 또는 `codex cloud diff`. 실제 계정 실측은 아직 |
| 결과를 AI Office에 보존할 수 있나 | 예(수동). diff·테스트 로그를 붙여넣으면 `result_packages`에 저장(diff 최대 500,000자, 로그 100,000자, SHA-256 기록). Storage(파일·스크린샷)는 아직 |
| 미리보기 | **미리보기 미제공**. Cloudflare Git 연동 Preview는 브랜치 푸시가 필요하고, Direct Upload는 운영 프로젝트와 따로 만들어야 해서 이번에 하지 않았다 |
| GitHub Actions 아티팩트로 보관 | 사용하지 않음(B 전 GitHub 업로드와 같은 문제) |
| B 전에 PR이 생기는가 | AI Office는 만들지 않는다. 루틴은 PM 전용 프롬프트로 바꿨다. Codex 웹의 "PR 만들기"는 사용자가 B 승인 후에만 누른다(앱이 막을 수는 없다) |

## 5. 비용

추가 결제 0원. Claude 루틴은 Claude Pro 사용량, Codex는 ChatGPT Plus 사용량(수동). Supabase·Cloudflare·GitHub 무료 범위. 유료 API를 호출하는 코드는 없다.

## 6. 이번 세션에서 실행한 명령(요약, 비밀값 없음)

- `WebFetch https://platform.claude.com/docs/en/api/claude-code/routines-fire` → 성공
- `WebFetch https://developers.openai.com/codex/cli/reference` → DNS 차단
- `gh api repos/openai/codex/issues/{50182,56350,56995}` → 이 세션에 저장소 API 접근 없음(403)
- `git clone --depth 1 --filter=blob:none --sparse https://github.com/openai/codex`(문서·소스 텍스트만 읽고 삭제)
- 로컬 Postgres 16에서 `scripts/test-db.sh` → 승인 게이트·RLS·마이그레이션 보존 시험 통과
- Codex CLI 설치·실행: **없음**
