# MinLab AI Office — 작업 규칙

여러 AI에게 일을 나누되 사용자는 요청·승인·검토만 한다. 규칙으로 가능한 일은 모델을 호출하지 않고, 같은 일을 중복 호출하지 않는다. 화면·답변·커밋·PR은 쉬운 한국어로 쓴다.

## 먼저 읽을 것

- 이 파일과 [현재 상태](docs/STATUS.md)만 먼저 읽는다.
- 작업에 필요할 때만 [문서 안내](docs/README.md)에서 해당 문서를 연다. archive·CHANGELOG·DEVLOG는 기본으로 읽지 않는다.
- `node scripts/repo-map.mjs`로 구조를 확인하고 필요한 파일·호출부만 읽는다. 버전은 package.json, 구현은 소스가 기준이다. 운영 반영 여부는 별도 확인한다.

## 변경·검증·반영

1. main에서 feat/·fix/·chore/ 브랜치로 작업한다. 요청을 해결하는 가장 작은 변경만 하고 기존 구현을 재사용한다.
2. `npm run typecheck`, `npm test`, `npm run build`를 모두 통과시킨다. DB 변경은 `scripts/test-db.sh`도 실행한다. 버그는 재현 시험과 원인 수정. 화면 변경은 데스크톱 1400px·휴대폰 400px에서 콘솔 오류·가로 넘침 확인.
3. 이 저장소(minho-nim/MinLab-AI-Office)만 시험과 PR verify 통과 후 푸시·PR·병합까지 허용된다. 실패·미확인은 보고한다. 다른 저장소 반영은 소유자 승인 뒤에만 한다. minho-nim/MinLab은 건드리지 않는다.
4. 운영 배포·Supabase 마이그레이션 적용·함수 배포는 소유자 요청/승인 뒤에만 한다. 함수 배포는 GitHub Actions '서버 함수 배포'(저장소 파일 그대로, verify_jwt 끄는 함수는 워크플로 목록만)를 쓴다. main 병합은 배포가 아니다. release에는 직접 커밋하지 않고 CI가 통과한 main으로 fast-forward만 한다. 휴대폰 배포는 GitHub Actions ‘운영 배포(release)’.
5. 화면 변경 시 기존 Artifact 데모도 갱신한다: https://claude.ai/artifact/KymYCpMcfjW7Cskyjyf7Ph . `npm run build:artifact`는 로컬 데모 단일 HTML을 만든다.

## 반드시 유지

- 앱 업무는 기획·견본·실행·올리기·배포 승인을 지킨다. [현재 플로우](docs/FLOW.md) 참조. 배정 ≠ 실행, 세션 시작 ≠ 완료. 확인한 상태와 출처만 표시한다.
- 승인·기획서·결과는 추가만 가능한 감사 기록. DB 게이트와 src/domain/workflow.ts 규칙을 함께 유지한다.
- 추가 결제 0원. 유료 API·크레딧 금지. Claude 안에서 Codex/Grok CLI 설치·실행 금지. 하위 에이전트를 Codex라고 부르지 않는다.
- 비밀값은 서버 secrets에만 둔다. 코드·커밋·채팅·프롬프트·프론트엔드·Actions 로그/아티팩트·공개 테이블에 인증정보를 남기지 않는다. .env.local 커밋 금지. 쿠키·auth.json·토큰 추출/재사용, 비공식 ChatGPT 백엔드 호출 금지. 패치를 Actions 아티팩트로 보관하려면 별도 동의가 필요하다.
- VITE_ 비밀키, RLS USING(true) 전체 허용, user_metadata 권한 판단 금지. 사용자 입력을 시스템 지시문에 이어 붙이지 않는다. HTML은 권한 없는 sandbox, SVG는 img로 미리 본다.
- 프로젝트 확인 후 업무를 접수한다. 저장소 생성은 사용자 버튼으로만, 비공개로 만든다. PM 대상은 허용 저장소와 managed_repos뿐이다.
- API/DB/기본 규칙 복사본을 바꾸면 관련 호출부와 동기화 시험을 확인한다. verify_jwt와 서버 인증을 유지한다. 상세는 구조 문서·해당 함수 참고.
- 일부러 남긴 한계는 `shortcut: <한계>, <고칠 때>`로 기록하고, 완료 보고에 미확인·위험을 짧게 적는다.

## 문서 관리

현재 규칙은 이 파일, 흐름은 FLOW, 미완료·미검증은 STATUS에 한 번만 쓴다. 변경 이력은 CHANGELOG, 날짜별 목적·이유는 DEVLOG. STATUS에 버전별 변경을 누적하지 않는다. 과거 기록은 archive에 보존하고 현재 규칙으로 적용하지 않는다.
