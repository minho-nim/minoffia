# MinLab AI Office — Claude 작업 안내

개인 AI 개발팀을 2D 도트 오피스로 보여주는 업무 관리 웹앱. React 18 + Vite + TypeScript, Supabase(인증·DB·Edge Function).
화면 문구와 커밋·PR은 한국어로 쓴다. 사양: `README.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`.

## 명령

- `npm run typecheck` · `npm test` · `npm run build` — 변경 후 셋 다 통과해야 한다.
- `npm run build:artifact` — Claude Artifact용 단일 HTML(`dist-artifact/artifact.html`, 항상 로컬 데모 모드).
- 화면 확인: Playwright로 `dist-artifact/index.html`을 열어 데스크톱(1400px)·모바일(400px) 스크린샷, 콘솔 오류와 가로 넘침 확인.

## 작업 흐름 (소유자가 승인한 규칙)

1. `main`에서 `feat/…`, `fix/…`, `chore/…` 브랜치를 만든다. `main`에 직접 푸시하지 않는다.
2. 커밋 → 브랜치 푸시 → PR 생성(`gh api repos/minho-nim/MinLab-AI-Office/pulls`, GraphQL 기반 `gh pr`은 막혀 있음).
3. `verify` 검사(GitHub Actions)가 **통과하면 Claude가 squash 병합**해도 된다:
   `gh api -X PUT repos/minho-nim/MinLab-AI-Office/pulls/<번호>/merge -f merge_method=squash`
   실패하면 고쳐서 다시 푸시하고, 통과 전에는 병합하지 않는다.
4. 화면이 바뀌면 Artifact(Claude 안 데모 페이지)도 다시 게시한다: https://claude.ai/artifact/KymYCpMcfjW7Cskyjyf7Ph
5. 운영 배포는 소유자가 요청할 때만 한다. Cloudflare Pages는 `release` 브랜치만 배포하므로,
   배포 명령은 `git fetch origin && git push origin origin/main:refs/heads/release`(release를 main에 맞춤)이다.
   현재 권한 설정은 `main`이 들어간 push를 막으므로 이 명령은 소유자가 직접 실행한다.
   `main` 병합만으로는 배포되지 않는다. `release`에 직접 커밋하지 않는다.

## 지켜야 할 것

- 비밀값(Claude Routine 토큰, service_role 키, 비밀번호)을 코드·커밋·채팅에 남기지 않는다. `.env.local`은 커밋 금지.
- 유료 API·크레딧이 드는 방법을 쓰지 않는다. 배정은 규칙 기반(LLM 호출 없음).
- 캐릭터 위치·말풍선·모니터·경고등은 **업무 데이터로만** 움직인다. 꾸며낸 활동을 넣지 않는다.
- 원격 실행이 성공해도 상태는 `in_progress`까지. 완료는 사람이 검토 대기 → 완료로 승인한다.
- `minho-nim/MinLab` 저장소는 건드리지 않는다.

## 구조

- `src/domain` 규칙(배정 router, 사용량 usage, 상태 전이 status, 지시서 handoff) — 단위 테스트 있음
- `src/office` 오피스: `layout.ts`(좌표, 논리 300×224), `scene.ts`(업무 → 위치), `draw.ts`, `sprites.ts`, `assets.ts`
- `src/assets/office` 배경(`background.webp`)과 캐릭터(`characters/<id>-stand|walk.png`)
- `src/data` 저장소: localStorage 데모 / Supabase
- `supabase/migrations`, `supabase/functions/dispatch-claude`

## Supabase

- 프로젝트 `minlab-ai-office` (ref `kmmicksimbredbyvdmvx`, 서울). URL `https://kmmicksimbredbyvdmvx.supabase.co`
- 스키마를 바꾸면 `supabase/migrations/000N_*.sql` 파일을 추가하고 같은 내용을 커넥터 `apply_migration`으로 적용한 뒤 `get_advisors`(security)를 확인한다.
- Edge Function을 바꾸면 `deploy_edge_function`으로 다시 배포한다(verify_jwt 유지).
- 이 클라우드 환경은 네트워크 정책상 `supabase.co`에 직접 접속할 수 없다. 서버 확인은 커넥터(SQL, 로그)로 한다.
