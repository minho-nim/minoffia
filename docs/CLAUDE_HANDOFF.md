# Claude 인수인계 · 2026-11-03

먼저 루트 CLAUDE.md와 docs/STATUS.md를 읽는다. 이 문서는 운영 반영/검증 때만 추가로 읽는다.

## 완료한 이전 작업

- PR #199: 기획서 버전 확인, Gemini 중복 예약/결과 재사용, 채점 오류 후 재시도, 계획/결과 수신·채점 코드 분리, 문서 축소와 원문 보관, AGENTS.md 연결.
- main 병합 커밋: ba9aa5f32994d7bb7d8e1b25dc2f4bf645617651.
- 이 커밋의 앱은 release에 반영됐고 Cloudflare 배포 성공을 확인했다.
- 운영 DB 마이그레이션 0038과 draft-plan 함수는 이 환경에 Supabase 연결이 없어 아직 반영하지 못했다. Gemini 중복 호출 방지는 서버 반영 전까지 활성화되지 않는다.

## 이번에 GitHub에 올린 추가 수정

PR #200의 수정이다. 병합 후에는 최신 main에 코드·테스트·마이그레이션·인수인계가 모두 포함된다. 앞서 전달한 작업공간 전용 미완료 패치를 다시 적용하지 않는다.

1. 계획·배정 원자적 저장: supabaseStore.addPlan은 save_pm_plan RPC 한 번으로 저장한다. SECURITY INVOKER로 기존 RLS/승인 트리거를 유지하고, 전체 작업 ID 일치와 소유자를 확인한다. 배정 저장 실패 시 계획도 롤백한다.
2. Linear 추적 정보 보존: claim_codex_linear가 외부 호출 전에 이슈 UUID를 예약한다. 생성 응답 유실 시 같은 UUID를 조회하고, DB 저장 실패는 성공으로 응답하지 않는다. status 조회는 이슈 URL을 복구한다. 사용자의 중단 기록이 상태 문구를 덮어써도 UUID를 유지한다.
3. 명시한 Linear 팀이 없으면 전송하지 않는다. 팀 설정이 비어 있을 때만 첫 팀을 사용한다. 이슈 id 입력 지원 여부도 전송 전에 확인한다.

별도 패치가 필요하면 [패치 파일](patches/atomic-plan-and-linear-tracking.patch)을 사용할 수 있다. 기준은 위 ba9aa5f 커밋이며, 이번 브랜치에는 이미 적용되어 있다. 중복 적용하지 않는다.

## 검증 상태

- 타입 검사·Vitest 전체 303개·프로덕션 빌드 통과.
- codex-linear/index.ts, linear-webhook/index.ts의 Deno 타입 검사 통과.
- DB 회귀 테스트 supabase/tests/99_atomic_plan_and_linear_tracking.sql 작성 및 scripts/test-db.sh 연결 완료.
- GitHub Actions의 임시 PostgreSQL 17에서 전체 마이그레이션·승인·RLS·원자적 롤백·중단 후 예약 UUID 유지·두 연결의 동시 예약/상한 검사가 통과했다. [검증 실행](https://github.com/minho-nim/MinLab-AI-Office/actions/runs/41637535275). 이후 PR에도 verify-db가 같은 검사를 자동 실행한다. 이는 운영 Supabase 적용과 별개다.
- 실제 Linear 이슈 생성/위임은 수행하지 않았다. 무료/구독 사용량을 쓰는 운영 시험과 단위 테스트를 구분한다.

## Claude가 이어서 할 일: 운영 Supabase 반영

1. 최신 main을 받고 실제 운영 마이그레이션 기록을 확인한다. 미적용 0038 → 0039 순으로 적용한다. 이미 적용된 SQL을 무작정 다시 실행하지 않는다. 코드·DB 회귀 검증은 위 CI에서 완료했다.
2. 최신 main의 draft-plan과 codex-linear, linear-webhook을 배포한다. codex-linear·draft-plan은 JWT 검증 유지, linear-webhook은 기존 JWT 검증 꺼짐 + 서명 검증 유지.
3. 이번 앱은 save_pm_plan RPC가 필요하다. **0039 DB 적용 뒤에 앱 release를 배포한다.** 앞선 PR #199 앱 배포와 구분한다. GitHub Actions의 ‘운영 배포(release)’는 main CI 통과와 fast-forward를 확인한다.
4. 실제 반영 결과와 Linear의 id 입력 지원/예약 UUID 조회 경로를 확인하고 STATUS.md를 갱신한다. 실제 이슈 생성·위임은 AI 실행을 유발할 수 있으므로 읽기 전용 확인과 구분한다. 비밀값은 코드/문서/채팅에 남기지 않는다.

사용자는 ‘Supabase는 Claude에서’라고 정했다. 이번 작업에서 운영 Supabase와 release는 변경하지 않는다. 남은 서버 반영 없이 앱만 먼저 배포하지 않는다.
