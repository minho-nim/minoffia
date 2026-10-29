# MinLab AI Office — Claude 작업 안내

개인 AI 개발팀을 2D 도트 오피스로 보여주는 업무 관리 웹앱. React 18 + Vite + TypeScript, Supabase(인증·DB·Edge Function).
화면 문구와 커밋·PR은 한국어로 쓴다. 사양: `README.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`.

## 명령

- `npm run typecheck` · `npm test` · `npm run build` — 변경 후 셋 다 통과해야 한다.
- `npm run build:artifact` — Claude Artifact용 단일 HTML(`dist-artifact/artifact.html`, 항상 로컬 데모 모드).
- 화면 확인: Playwright로 `dist-artifact/index.html`을 열어 데스크톱(1400px)·모바일(400px) 스크린샷, 콘솔 오류와 가로 넘침 확인.

## 작업 흐름 (소유자가 승인한 규칙, 2026-10-29 변경)

1. `main`에서 `feat/…`, `fix/…`, `chore/…` 브랜치를 만들어 로컬에서 작업하고 `typecheck`·`test`·`build`(DB를 바꾸면 `scripts/test-db.sh`)를 돌린다.
2. **이 저장소(`minho-nim/MinLab-AI-Office`)에 한해**, 1번 시험이 모두 통과하면 푸시·PR 생성·병합(`verify` 통과 확인 후)까지 Claude가 알아서 한다(소유자 승인, 2026-10-29).
   시험이 하나라도 실패하거나 확인하지 못했으면 올리지 않고 보고한다. 다른 저장소는 여전히 소유자 승인 뒤에만 올린다.
3. PR은 `gh api repos/minho-nim/MinLab-AI-Office/pulls`로 만든다(GraphQL 기반 `gh pr`은 막혀 있음). 병합은
   `verify` 통과를 확인한 뒤 `gh api -X PUT repos/minho-nim/MinLab-AI-Office/pulls/<번호>/merge -f merge_method=squash`.
4. 화면이 바뀌면 Artifact(Claude 안 데모 페이지)도 다시 게시한다: https://claude.ai/artifact/KymYCpMcfjW7Cskyjyf7Ph
5. 운영 배포는 소유자가 요청할 때만 한다. Cloudflare Pages는 `release` 브랜치만 배포하므로,
   배포 명령은 `git fetch origin && git push origin origin/main:refs/heads/release`(release를 main에 맞춤)이다.
   현재 권한 설정은 `main`이 들어간 push를 막으므로 이 명령은 소유자가 직접 실행한다.
   `main` 병합만으로는 배포되지 않는다. `release`에 직접 커밋하지 않는다.
6. 운영 Supabase에 마이그레이션 적용·Edge Function 배포도 운영 변경이다. 병합과 별개로 소유자 승인 후에만 한다.

## 앱이 다루는 업무 플로우 (v0.2.1, 수정 금지)

사용자 요청 → ChatGPT 기획(수동 인계) → **A 승인** → Claude PM 계획(저장소 쓰기 금지) → **E 실행 승인** → Codex Cloud 주 개발(자동 시작 미검증 → 수동 인계) → 결과 패키지 검토 → **B 승인** 후 GitHub 업로드·PR → **C 승인** 후 운영 배포.
- 수정 루프: A에서 수정 요청 → ChatGPT 재기획. 결과 검토에서 수정 요청 → Claude PM 재계획(같은 기획서 버전, 새 계획은 E 재승인). 보조 AI(Claude·Gemini·Grok)도 E 승인을 받는다(소유자 결정, 2026-10-29).
- 배정 완료 ≠ 실행 중, 세션 시작(HTTP 200) ≠ 완료. 검증하지 않은 자동 실행을 성공으로 표시하지 않는다.
- Claude 세션 안에 Codex CLI·Grok CLI를 설치·실행하지 않는다. 하위 에이전트를 Codex라고 부르지 않는다.
- 승인·기획서·결과는 추가만 가능한 감사 기록이다. 게이트 규칙은 `supabase/migrations/0003_v021_approval_gates.sql`과 `src/domain/workflow.ts`가 같아야 한다.

## 지켜야 할 것

- 비밀값(Claude Routine 토큰, service_role 키, 비밀번호)을 코드·커밋·채팅에 남기지 않는다. `.env.local`은 커밋 금지.
- 유료 API·크레딧이 드는 방법을 쓰지 않는다. 배정·입력창 분류는 규칙 기반(LLM 호출 없음).
- 입력창의 일반 질문만 사용자가 버튼을 누를 때 Gemini 무료 API로 보낸다(소유자 결정 2026-10-29, `supabase/functions/ask-gemini`). 질문 글은 저장하지 않는다. 충돌 점검은 `docs/SPEC_CONFLICTS_2026-10-29.md`.
- 업무로 만들기 전에는 반드시 프로젝트를 사용자에게 확인받는다("이 프로젝트 맞아요?").
- 새 프로젝트의 GitHub 저장소는 사용자가 버튼을 누를 때만 서버(`supabase/functions/create-repo`)가 비공개 빈 저장소로 만든다(소유자 결정 2026-10-29). Claude PM은 `CLAUDE_ALLOWED_REPOSITORY`와 `managed_repos`의 저장소에서만 일한다.
- 캐릭터 위치·말풍선·모니터·경고등은 **업무 데이터로만** 움직인다. 꾸며낸 활동을 넣지 않는다.
- 원격 실행이 성공해도 상태는 `in_progress`까지. 완료는 사람이 검토 대기 → 완료로 승인한다.
- `minho-nim/MinLab` 저장소는 건드리지 않는다.

## 구조

- `src/domain` 규칙(배정 router, 사용량 usage, 상태 전이 status, 지시서 handoff) — 단위 테스트 있음
- `src/domain/workflow*.ts`·`pmPlan.ts`·`adapters.ts`·`handoffV2.ts` v0.2.1 승인 단계, PM 계획 검증, 실행 경로 상태
- `src/components/WorkflowPanel.tsx` 업무 카드의 진행 단계 패널
- `src/domain/triage.ts`·`src/components/Inbox.tsx` 업무 탭 입력창(규칙 분류, 프로젝트 확인, Gemini·ChatGPT 선택)
- `src/domain/requestContext.ts`·`src/components/RequestContext.tsx` 링크 읽기 결과·GPT 확인 질문(규칙은 `0005_links_clarifications.sql`), 서버 `supabase/functions/fetch-link`(내부망 차단은 `safety.ts`, 시험 있음)
- `src/domain/attachments.ts`·`src/components/Attachments.tsx` 이미지 첨부(비공개 버킷 `attachments`, 규칙은 `0004_attachments.sql`과 같아야 함)
- `src/office` 오피스: `layout.ts`(좌표, 논리 300×224), `scene.ts`(업무 → 위치), `draw.ts`, `sprites.ts`, `assets.ts`
- `src/assets/office` 배경(`background.webp`)과 캐릭터(`characters/<id>-stand|walk.png`)
- `src/data` 저장소: localStorage 데모 / Supabase
- `supabase/migrations`, `supabase/functions/dispatch-claude`, `supabase/functions/fetch-link`, `supabase/functions/ask-gemini`, `supabase/functions/create-repo`

## Supabase

- 프로젝트 `minlab-ai-office` (ref `kmmicksimbredbyvdmvx`, 서울). URL `https://kmmicksimbredbyvdmvx.supabase.co`
- 스키마를 바꾸면 `supabase/migrations/000N_*.sql` 파일을 추가하고 같은 내용을 커넥터 `apply_migration`으로 적용한 뒤 `get_advisors`(security)를 확인한다.
- Edge Function을 바꾸면 `deploy_edge_function`으로 다시 배포한다(verify_jwt 유지).
- 이 클라우드 환경은 네트워크 정책상 `supabase.co`에 직접 접속할 수 없다. 서버 확인은 커넥터(SQL, 로그)로 한다.
