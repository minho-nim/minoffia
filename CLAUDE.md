# MinLab AI Office — Claude 작업 안내

> **새 대화는 먼저 `docs/HANDOFF_2026-11-01.md`(지금 상태·소유자 취향·남은 일)를 읽는다.**

**목표(소유자 정의, 2026-10-30)**: MinLab AI Office는 여러 AI(ChatGPT·Claude·Codex·Gemini·Grok)에게 내 요청에 맞는 일을 효율적으로 나눠 맡기고, 각 AI의 토큰·사용량은 최소로 쓰도록 관리하는 개인 AI 개발팀 사무실이다. 기능을 만들거나 고를 때 이 목표를 기준으로 판단한다.
- AI를 안 써도 되는 일(분류·상태 질문·배정·프로젝트 확인)은 규칙으로 한다(토큰 0).
- **최종 목표(소유자 2026-10-30)**: 사용자가 하는 일은 질문(요청), 승인, 결과 검토·수정 요청뿐이다. 나머지 손작업(복사·붙여넣기·전달 버튼)은 무료·구독 안에서 하나씩 자동으로 바꾼다.
- AI는 사용자의 행동(접수 확인·승인·수정 요청·버튼)이 있을 때만 쓴다. 같은 일을 두 번 시키지 않는다(같은 이미지·같은 기획서 버전은 다시 보내지 않음).
  접수 확인 → Gemini 기획서 초안 자동, A 승인 → Claude PM 전송 자동, Gemini 초안에 수정 요청 → Gemini 재작성 자동(v0.4.0).
  PM 계획은 PM 세션이 1회용 제출표로 `submit-plan`에 보내고 앱이 `parsePmPlan` 검증 뒤 저장(v0.4.2, `0020_pm_plan_inbox.sql`).
  Claude 보조 개발 결과도 세션이 `submit-result`로 보내고 앱이 결과 패키지로 저장(v0.4.3, `0021_dev_result_inbox.sql`). verify_jwt false는 `submit-plan`·`submit-result`(제출표로 확인)와 `push`(flush는 입력 없이 DB 알림 줄만 보냄, 나머지 동작은 함수 안에서 소유자 확인)뿐.
- 싼 길부터: 규칙 → 무료(Gemini, 기획서 초안 포함) → 구독 안 수동 인계(ChatGPT는 어렵거나 중요한 기획만·Codex) → 구독 자동(Claude PM·보조 개발). 유료 API는 쓰지 않는다.
- 하루 상한과 실제 사용 기록을 화면에 보여 준다. 공급자의 남은 토큰은 알 수 없으므로 횟수로 관리한다.

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
5. 운영 배포는 소유자가 요청할 때만 한다. Cloudflare Pages는 `release` 브랜치만 배포한다.
   앱 업무는 C 승인 시 서버(`supabase/functions/deploy-release`)가 release를 main으로 앞당긴다(v0.3.0, 소유자 결정 2026-10-30).
   이 저장소 자체 배포를 소유자가 요청하면 명령은 `git fetch origin && git push origin origin/main:refs/heads/release`이고,
   현재 권한 설정은 `main`이 들어간 push를 막으므로 소유자가 직접 실행한다. 휴대폰에서는 GitHub Actions의 "운영 배포(release)" 버튼(`.github/workflows/deploy-release.yml`, 수동 실행·fast-forward만·main verify 통과 필요)으로 같은 일을 한다. `main` 병합만으로는 배포되지 않는다. `release`에 직접 커밋하지 않는다.
6. 운영 Supabase에 마이그레이션 적용·Edge Function 배포도 운영 변경이다. 병합과 별개로 소유자 승인 후에만 한다.

## 앱이 다루는 업무 플로우 (v0.3, 소유자 수정 2026-10-30)

기준 문서: `docs/FLOW_v0.3_2026-10-30.md`(12단계, 모바일만으로 요청~결과 확인). 아래 v0.2.1 규칙은 그대로 유지하고, 바뀐 점은 그 문서의 '이전 결정과 바뀐 것'을 따른다.

사용자 요청 → Gemini 기획서 초안(자동, 중요한 업무만 ChatGPT 수동) → **A 기획 승인** → Claude PM 계획(자동 시작·자동 제출, 저장소 쓰기 금지, 개발 방식 `prototype_first`/`direct` 제안) → (견본 먼저면: Gemini HTML 견본 자동 또는 AI Studio Build 수동 → 미리보기 → **P 견본 승인**) → **E 실행 승인**(Claude 작업은 자동 시작) → Codex Cloud 주 개발(자동 시작 미검증 → 수동 인계. 결정: Codex for Linear 절충안, `docs/CODEX_LINEAR_DECISION_2026-10-30.md`) → 결과 패키지 검토 → **B 승인** 후 GitHub 업로드·PR → **C 승인** 후 운영 배포.
- 견본 먼저 계획에서 Codex 작업의 E는 P 뒤에만(`0014_prototype_first.sql`). P를 하면 견본 작업(gemini)은 끝난 것으로 기록되고 Codex 지시서에 승인된 견본이 들어간다.
- Claude 보조 개발: PM이 Claude(`claude_support`)에 배정한 작업은 E 승인 뒤 서버(`supabase/functions/dispatch-claude-dev`, 예약 `claim_claude_dev` 0016)가 두 번째 루틴으로 시작한다. B 승인 전 push·PR 금지, 세션 시작은 '시작됨'까지만, 결과는 세션이 `submit-result`로 보낸다(안 되면 사용자가 옮김). 루틴·secrets는 `docs/CLAUDE_ROUTINE.md`.
- 수정 루프: A에서 수정 요청 → ChatGPT 재기획. 결과 검토에서 수정 요청 → Claude PM 재계획(같은 기획서 버전, 새 계획은 E 재승인). 보조 AI(Claude·Gemini·Grok)도 E 승인을 받는다(소유자 결정, 2026-10-29).
- 배정 완료 ≠ 실행 중, 세션 시작(HTTP 200) ≠ 완료. 검증하지 않은 자동 실행을 성공으로 표시하지 않는다.
- Claude 세션 안에 Codex CLI·Grok CLI를 설치·실행하지 않는다. 하위 에이전트를 Codex라고 부르지 않는다.
- 승인·기획서·결과는 추가만 가능한 감사 기록이다. 게이트 규칙은 `supabase/migrations/0003_v021_approval_gates.sql`과 `src/domain/workflow.ts`가 같아야 한다.

## 지켜야 할 것

- 비밀값(Claude Routine 토큰, service_role 키, 비밀번호)을 코드·커밋·채팅에 남기지 않는다. `.env.local`은 커밋 금지.
- 유료 API·크레딧이 드는 방법을 쓰지 않는다. 배정은 규칙 기반(LLM 호출 없음). 입력창은 앱 상태 질문·새 프로젝트만 규칙이고, 그 밖의 말은 Gemini 무료가 먼저 판단한다(질문·업무·애매 + 프로젝트, 질문이면 같은 호출로 답, 업무여도 프로젝트 확인은 사용자에게 받음. 소유자 2026-11-01, `src/domain/aiRoute.ts`·`ask-gemini`의 route).
- 요청 자료 이미지는 "Gemini로 분석"을 누르거나, 기획서 초안을 쓰기 직전(아직 분석 안 한 사진 3장까지, v0.4.7 소유자 승인)에 서버(`supabase/functions/analyze-image`)가 Gemini 무료 API로 분석한다(관찰·추정 구분, 원본 대체 아님, 규칙은 `0008_image_analyses.sql`).
- 견본 먼저 계획이 오면 Gemini가 HTML 견본 한 장을 만들어 견본으로 올린다(`supabase/functions/draft-prototype`, 계획 버전마다 한 번, HTML·CSS만). AI Studio Build 수동 견본도 그대로 쓸 수 있다.
- 요청 자료에는 문서도 올린다(PDF·TXT·MD·CSV·JSON·HTML·DOCX·XLSX·PPTX·ZIP 20MB, 역할 `document`, SVG는 이미지 5MB, `0012`·`0013` 마이그레이션). 결과 스크린샷은 PNG·JPG·WEBP·GIF만.
  HTML·SVG는 저장소에 text/plain으로 올리고 앱 안에서만 본다(HTML은 권한 없는 sandbox iframe, SVG는 `<img>`). 미리보기는 브라우저 안에서만(`src/components/FilePreview.tsx`, DOCX·XLSX·PPTX 글 뽑기는 `supabase/functions/analyze-image/office.ts`, ZIP은 jszip을 열 때만 불러옴).
  "Gemini로 요약"은 10MB 이하 PDF·글·HTML·DOCX·XLSX·PPTX(Office는 서버가 글만 뽑아 보냄). SVG·ZIP은 미리보기만.
- 입력창 일반 질문: 앱 상태는 규칙, 일반 질문은 보내면 Gemini 무료(`supabase/functions/ask-gemini`)가 바로 답한다(답은 조각조각 스트리밍, 생각 단계 끔, v0.4.15). 답 아래 작은 링크로 "GPT에게 이어서 묻기"(복사)·"업무로 만들기". 프로젝트 이름이 든 질문도 바로 답하고 GPT 권유는 링크로만(소유자 2026-10-31 "물어보면 그냥 대답"). 충돌 점검은 `docs/SPEC_CONFLICTS_2026-10-29.md`, `docs/FLOW_v0.3_2026-10-30.md`.
- 입력창 화면 대화는 계정에 저장해 기기 간 이어 본다(`inbox_state`). 개발일지용 대화 기록(`chat_messages`)은 프로젝트·업무에 연결된 메시지만 남기고 일반 대화·질문은 남기지 않으며, 소유자가 개발일지 화면에서 지울 수 있다. 개발일지 Markdown은 `src/domain/devlog.ts`.
- 휴대폰 알림(v0.4.12): 기획서·확인 질문·계획·견본·결과·막힘이 생기면 DB 트리거 → `push_outbox` → pg_net → `push`가 웹 푸시로 알린다(`0024_push_notifications.sql`, `public/sw.js`). 입력창 미니엉 알림은 확인 질문·막힘만.
- 입력창 접수 매니저 이름은 **미니엉**(코드 id는 `mina` 그대로).
- 미니엉은 업무 단계·버전이 바뀌면 입력창에 알리고 버튼(A·B 승인, 업무 카드 보기)을 둔다(`src/domain/stageNotice.ts`, 규칙만). 승인은 업무 카드와 같은 `canApprove`를 지난다.
- Gemini 답 바로 뒤의 개발 요청은 앞 질문·답을 업무에 함께 넣고, 애매한 말만 "질문인가요, 업무 요청인가요?"로 묻는다. 개발 전(E 승인 없음)에 지운 업무의 대화 기록은 함께 지운다(`0017_predev_task_chat.sql`).
- 업무로 만들기 전에는 반드시 프로젝트를 사용자에게 확인받는다("이 프로젝트 맞아요?").
- 새 프로젝트의 GitHub 저장소는 사용자가 버튼을 누를 때만 서버(`supabase/functions/create-repo`)가 비공개 빈 저장소로 만든다(소유자 결정 2026-10-29). Claude PM은 `CLAUDE_ALLOWED_REPOSITORY`와 `managed_repos`의 저장소에서만 일한다.
- C(운영 배포) 승인은 서버(`supabase/functions/pr-status`)가 확인한 최신 'CI 성공'(열린 PR 또는 병합됨) 기록이 있어야 한다(`0010`, v0.4.5 `0022_auto_pr_merge.sql`).
  C 승인 뒤 `deploy-release`가 CI를 확인한 그 커밋일 때만 PR을 squash 병합하고, fast-forward로만 release를 앞당기며 `deployments`에 기록한다(갈라진 release는 덮어쓰지 않음, 성공 기록은 C 승인 필수 `0011_inbox_deployments.sql`).
- 꼬임 방지(v0.4.20): 같은 계획의 다른 작업이 진행 중이면 올리기 승인 불가(`0025_b_waits_all_work.sql`·`canApprove('B')`). 배포 승인 = 배포 시작, main에 다른 변경이 더 있으면 확인 필요, main CI가 끝나 통과해야 release를 앞당긴다. 결과 수정 요청 → PM 자동 재전송. 흐름 시뮬레이션은 `src/domain/simulation.test.ts`.
- 실행 승인(E) → Claude 작업 자동 시작, 올리기 승인(B) → Claude 결과면 `dispatch-claude-pr`이 승인된 diff 그대로 PR(병합 없음), 이후 앱이 PR·CI를 자동 확인(v0.4.5, 소유자 승인 2026-10-31).
- 업무 탭 맨 위 "내 차례"(`src/domain/myTurn.ts`·`src/components/MyTurn.tsx`)는 사무실 말풍선 ?와 같은 기준으로 내가 손댈 일만 모은다. 목록의 바로 승인(A·B)도 `canApprove`를 지난다.
- 캐릭터 위치·말풍선·모니터·경고등은 **업무 데이터로만** 움직인다. 꾸며낸 활동을 넣지 않는다. 승인·답을 기다리는 말풍선은 `src/office/speech.ts`(업무 단계 → 말하는 캐릭터·문구).
- 원격 실행이 성공해도 상태는 `in_progress`까지. 완료는 사람이 검토 대기 → 완료로 승인한다.
- AI 휴가(v0.4.39, 소유자 2026-11-01): '팀 관리' 탭(v0.4.40)에서 근무·휴가 칸 사이로 옮기면(체크 후 가운데 버튼, 또는 끌어다 놓기) 휴가(`agent_leave`, 0026). 휴가인 AI는 사무실 아래 출입문으로 나가 사라지고, 새 배정(`routeTask`의 leave)과 PM 계획(`dispatch-claude` 프롬프트)에서 빠져 규칙대로 다른 AI가 맡는다. 진행 중인 업무는 건드리지 않는다. 미니엉·CI 봇은 휴가 대상이 아니다.
- `minho-nim/MinLab` 저장소는 건드리지 않는다.

## 구조

- `src/domain` 규칙(배정 router, 사용량 usage, 상태 전이 status, 지시서 handoff) — 단위 테스트 있음
- `src/domain/workflow*.ts`·`pmPlan.ts`·`adapters.ts`·`handoffV2.ts` v0.2.1 승인 단계, PM 계획 검증, 실행 경로 상태
- `src/components/WorkflowPanel.tsx` 업무 카드의 진행 단계 패널
- `src/domain/triage.ts`·`src/components/Inbox.tsx` 대화 탭 입력창(v0.4.16부터 대화·업무·프로젝트·에이전트 탭, 처음은 대화)(규칙 분류, 프로젝트 확인, Gemini·ChatGPT 선택)
- `src/domain/requestContext.ts`·`src/components/RequestContext.tsx` 링크 읽기 결과·GPT 확인 질문(규칙은 `0005_links_clarifications.sql`), 서버 `supabase/functions/fetch-link`(내부망 차단은 `safety.ts`, 시험 있음)
- `src/domain/attachments.ts`·`src/components/Attachments.tsx` 이미지·문서 첨부(비공개 버킷 `attachments`, 규칙은 `0004_attachments.sql`·`0012_document_attachments.sql`과 같아야 함)
- `src/office` 오피스: `layout.ts`(좌표, 논리 300×224), `scene.ts`(업무 → 위치), `draw.ts`, `sprites.ts`, `assets.ts`
- `src/assets/office` 배경(`background.webp`)과 캐릭터(`characters/<id>-stand|walk.png`)
- `src/data` 저장소: localStorage 데모 / Supabase(여러 기기 실시간 반영은 Supabase Realtime, 표 목록은 `0015_realtime.sql`·`0020`과 `supabaseStore.ts`의 `REALTIME_TABLES`가 같아야 함)
- `supabase/migrations`, `supabase/functions/`: dispatch-claude · submit-plan · dispatch-claude-dev · submit-result · dispatch-claude-pr · draft-spec · draft-prototype · ask-gemini · analyze-image · fetch-link · create-repo · pr-status · deploy-release · push (전체 그림은 `docs/ARCHITECTURE.md`)
- `src/domain/myTurn.ts`·`stall.ts`·`src/components/MyTurn.tsx` 내 차례·멈춤 감지, `src/office/speech.ts` 사무실 말풍선
- `src/domain/devlog.ts`·`src/components/DevlogPanel.tsx` 개발일지(대화 + 업무 기록 → 프로젝트별·날짜별 Markdown)

## Supabase

- 프로젝트 `minlab-ai-office` (ref `kmmicksimbredbyvdmvx`, 서울). URL `https://kmmicksimbredbyvdmvx.supabase.co`
- 스키마를 바꾸면 `supabase/migrations/000N_*.sql` 파일을 추가하고 같은 내용을 커넥터 `apply_migration`으로 적용한 뒤 `get_advisors`(security)를 확인한다.
- Edge Function을 바꾸면 `deploy_edge_function`으로 다시 배포한다(verify_jwt 유지).
- 이 클라우드 환경은 네트워크 정책상 `supabase.co`에 직접 접속할 수 없다. 서버 확인은 커넥터(SQL, 로그)로 한다.
