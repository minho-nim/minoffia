# 구조

```
휴대폰·PC 브라우저 (Cloudflare Pages: release 브랜치)
 ├─ src/domain   규칙: 배정 router · 단계 workflow · 알림 stageNotice · 내 차례 myTurn · 멈춤 stall · 지시서 handoffV2 · 계획 검증 pmPlan
 ├─ src/office   도트 사무실: 업무 → 위치(scene) · 말풍선 상태(speech) · 그리기
 ├─ src/data     localStore(데모) / supabaseStore(Supabase + Realtime)
 └─ src/components  입력창 Inbox · 내 차례 · 업무 카드 WorkflowPanel · 첨부 · 개발일지
        │ 로그인 JWT (소유자만)
        ▼
Supabase (서울)
 ├─ Postgres + RLS + 트리거   승인 게이트(approvals_guard) · 배정 상한(agent_assignments_guard) · 첨부 규칙 · 추가만 가능한 기록
 ├─ Storage attachments       비공개 버킷(이미지·문서·견본)
 └─ Edge Functions
     ├─ ask-gemini · draft-spec · draft-prototype · analyze-image   Gemini 무료(키 A, B 예비, 하루 상한, 글은 저장 안 함)
     ├─ dispatch-claude      기획 승인 → PM 루틴 시작(+계획 제출표)
     ├─ submit-plan          PM 세션 → 계획 원문(1회용 제출표, verify_jwt off)
     ├─ dispatch-claude-dev  실행 승인 → 보조 개발 루틴 시작(+결과 제출표)
     ├─ submit-result        보조 개발 세션 → 결과 원문(1회용 제출표, verify_jwt off)
     ├─ push                 휴대폰 알림(웹 푸시). DB 트리거 → push_outbox → pg_net이 flush로 깨움(verify_jwt off, flush는 입력 없음)
     ├─ dispatch-claude-pr   올리기 승인 → 승인된 diff로 PR 세션(병합 없음)
     ├─ pr-status            PR·CI 확인(PR 주소가 없으면 작업 브랜치로 찾음)
     ├─ deploy-release       배포 승인 → 확인한 커밋 squash 병합 → release fast-forward
     ├─ draft-plan            Claude PM 불가 시 Gemini 분배
     ├─ dispatch-gemini-dev   쉬운 개발 → GitHub Actions
     ├─ review-result · submit-review  결과 검사·교차 채점
     ├─ codex-linear · linear-webhook  Codex 위임·소식
     └─ fetch-link · create-repo
        │
        ▼
Claude Code 루틴(Pro 구독): PM("업무 실행") · 보조 개발("보조 개발": 개발 / 올리기 두 종류)
Codex Cloud(Plus 구독): codex-linear 위임·댓글 읽기 / linear-webhook 소식 수신, 결과 등록은 수동
GitHub: PR → Actions(verify) → 서버 병합 → release → Cloudflare 배포
```

## 원칙

- **사람은 정하고 확인만**: 기획·실행·(견본)·올리기·배포 승인. 나머지는 규칙과 구독 안 AI가 자동으로 한다.
- **확인한 것만 보여 준다**: 세션 시작 ≠ 완료. 결과는 세션이 직접 보내거나 사람이 등록한 것만, 출처를 표시한다.
- **멈추면 알린다**: 자동으로 넘어가야 할 단계가 오래 그대로면 내 차례에 [!].
- **같은 일을 두 번 하지 않는다**: 기획서 버전·계획 버전·결과 버전마다 한 번(원자적 예약 함수와 유일 제약).
- **비밀은 서버에만**: 브라우저에는 publishable key만. 루틴 토큰·GitHub 토큰·Gemini 키는 secrets, 제출표는 해시만 저장.

## 배정 규칙(접수 시 처음 배정)

1. 요청 유형이 있으면 그대로, `자동`이면 제목+설명의 키워드 수로 유형을 정한다. 없으면 기획.
2. 유형별 후보 순서에서 오늘 한도가 남은 첫 에이전트를 고른다(기획 Claude → Codex / 개발 Codex → Claude / 디자인 Studio A → B / 프로토타입 Studio B → A / 리서치 Grok → Claude / QA CI 봇).
3. 실제 개발 담당은 Claude PM 계획이 정한다(처음 배정과 무관하게 PM 전송 가능).
