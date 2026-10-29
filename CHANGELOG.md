# 변경 기록

## 0.2.2 — 2026-10-29

### 고침
- 캐릭터가 걷지 않고 순간 이동하던 문제: 기기의 "동작 줄이기(애니메이션 효과 끔)" 설정에서도 문 → 복도 → 문으로 걷는다. 그 설정에서는 작업 중 흔들림만 끈다.
- 오피스가 화면 밖(휴대폰에서 업무 목록을 보는 중)이면 걷기를 멈췄다가, 다시 보이면 이어서 걷는다.
- 머리글 버전 표시가 v0.1로 고정돼 있던 문제: `package.json` 버전을 그대로 보여 준다.

## 0.2.1 — 2026-10-29

v0.2.0 지시서와 v0.2.1 수정 지시서를 현재 저장소(v0.1 + 10월 29일 수정분)에 적용했다. 새 앱을 만들지 않고 기존 오피스·로그인·업무 데이터를 유지했다.

### 추가
- **4개 승인 이벤트**: A(개발 방향), E(AI 실행), B(GitHub 업로드), C(운영 배포). 서로 다른 기록이며 DB 트리거가 순서를 강제한다.
- 기획서 버전(`task_specs`): ChatGPT 기획 결과를 수동으로 저장. 원문 보존, 버전이 바뀌면 이전 A 승인 무효.
- Claude PM 계획(`pm_plans`) 검증·저장, 작업 배정(`agent_assignments`), 결과 패키지(`result_packages`, diff·테스트 로그·SHA-256).
- 업무 카드의 **진행 단계** 패널: 기획 → A → PM 계획 → E·실행 → 결과·B → C.
- 두 개의 수정 루프(흐름도 기준):
  - A 단계 **수정 요청(ChatGPT로)**: 고칠 점을 기록하면 단계가 '기획 중'으로 돌아가고, ChatGPT용 자료에 수정 요청과 이전 프롬프트가 함께 들어간다.
  - 결과 검토 **수정 요청(Claude PM으로)**(`revision_requests`): 같은 기획서 버전으로 PM에 한 번 더 보낼 수 있고, 새 계획의 작업은 E를 다시 받는다. 수정을 요청한 결과는 B 승인 대상이 아니다.
- 실행 경로 연결 상태 표시(`src/domain/adapters.ts`): Claude PM 검증됨, Codex 자동 실행 미검증(수동 인계), GPT 수동, Gemini·Grok 미연결.
- 오피스 캐릭터가 배정 기록을 따른다(E 전 대기, 사용자가 시작 기록 → 작업 중).
- DB 시험(`scripts/test-db.sh`): 로컬 Postgres에서 승인 게이트·RLS·중복 방지·v0.1 데이터 보존 확인.
- 문서: `docs/CLOUD_CODEX_DISPATCH_VERIFICATION_2026-10-29.md`, `docs/CLOUD_FEASIBILITY_2026-10-29.md`.

### 바뀜
- Claude 루틴: 코드 작성·PR 생성 → **PM 전용**(계획 JSON만, 저장소 쓰기 금지).
- `dispatch-claude`: A 승인된 최신 기획서만 전송, 같은 버전 중복 전송 금지, `anthropic-version: 2026-10-21`.
- 업무 카드의 "Claude Cloud 실제 실행" 버튼 → 진행 단계 3번(A 승인 후)으로 이동.
- 작업 규칙(`CLAUDE.md`): 푸시·PR·병합은 소유자의 명시적 승인 후에만.

### 마이그레이션
- `0003_v021_approval_gates.sql`: 기존 `tasks`에 `stage`·`user_original_text`·`dispatch_spec_revision`·`pr_url` 추가, 완료 업무는 `completed`, 나머지는 `received`로. 기존 행 삭제 없음.

### 아직 하지 않음
- Gemini 이미지 분석, 링크 읽기(SSRF 차단 포함), Storage 첨부, ChatGPT 자동 연동, Codex 자동 시작, CI 상태 자동 반영, PM 계획 자동 회수.
