# 구조

```
브라우저 (Cloudflare Pages 또는 로컬)
 ├─ src/domain      규칙: 배정(router), 사용량(usage), 상태 전이(status), 지시서(handoff)
 ├─ src/office      도트 오피스: 좌표(layout), 장면(scene: 업무 상태 → 위치·말풍선), 그리기(draw), 스프라이트
 ├─ src/data        저장소: localStore(데모) / supabaseStore(동기화, 15초 폴링)
 └─ src/lib         Supabase 클라이언트, dispatch-claude 호출
        │  (로그인 JWT)
        ▼
Supabase
 ├─ Postgres + RLS  projects / tasks / usage_runs, 소유자만 접근
 ├─ tasks_guard     클라이언트의 dispatch_* 변경 무시, 전송 중 상태 변경 금지
 └─ Edge Function dispatch-claude
       1. JWT 사용자 = OFFICE_OWNER_EMAIL
       2. 업무 담당 = claude, 프로젝트 repo = CLAUDE_ALLOWED_REPOSITORY
       3. claim_claude_dispatch: advisory lock + 오늘(KST) 실행 수 < min(2, CAP) + none/failed(확인됨) → dispatching + 실행 기록
       4. Fire URL POST (20초 제한)
       5. 성공 → dispatched + in_progress + 세션 URL / 실패 → failed + blocked + 오류
        │
        ▼
Claude Code Cloud Routine (Claude Pro 사용량) → GitHub 브랜치·PR → GitHub Actions(verify)
```

## 원칙

- **완료 표시는 사람만** 한다. 원격 실행이 성공해도 상태는 *진행 중*까지다.
- **실패는 차단**으로 남는다. 재실행은 사람이 Routines History를 확인했다고 체크해야 한다.
- **화면은 사실만** 보여준다. 캐릭터 위치, 모니터 불빛, 경고등, 대기열 메모는 모두 업무 데이터에서 나온다.
- **비밀은 서버에만.** 브라우저에는 Supabase publishable key만 있다.

## 배정 규칙

1. 요청 유형이 있으면 그대로, `자동`이면 제목+설명의 키워드 수로 유형을 정한다(동점이면 개발 > 기획 > QA > 디자인 > 프로토타입 > 리서치). 없으면 기획.
2. 유형별 후보 순서에서 오늘 한도가 남은 첫 에이전트를 고른다.
   - 기획 Claude → Codex / 개발 Codex → Claude / 디자인 Studio A → B / 프로토타입 Studio B → A / 리서치 Grok → Claude / QA CI 봇
3. 모두 한도면 1순위에 두고 "내일 실행"으로 표시한다.
