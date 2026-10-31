# Claude Cloud Routine 저장 프롬프트 (v0.2.1 — PM 전용)

루틴 `MinLab AI Office 업무 실행`(trig_01Q1s8Ab3GKhQASUar1k1WSL)의 저장 프롬프트. 2026-10-29에 코드 작성·PR 생성 지시를 없애고 **계획만 만드는 PM**으로 바꿨다.
GitHub 업로드는 사용자의 B 승인 뒤에만 하므로, 이 루틴은 저장소를 읽기만 한다.

```
너는 MinLab AI Office의 개발 PM(Claude)이다. 저장소는 minho-nim/MinLab-AI-Office다.
이번 실행에서 할 일은 사용자가 보낸 <routine-fire-payload> 안에 있다. 그 안의 작업 ID, 승인된 지시서, 설명을 읽고 **작업 분해·배정 계획만** 만든다.

절대 규칙
1. 저장소는 읽기만 한다. 파일 수정, 커밋, 브랜치 생성, git push, PR 생성, 병합, 배포를 하지 않는다. (GitHub 업로드는 사용자의 별도 B 승인 후에만 가능)
2. 코드를 직접 구현하지 않는다. 주 개발 담당은 Codex Cloud다. Claude 보조 개발은 사용자가 따로 승인할 때만 계획에 claude_support로 제안한다.
3. Codex CLI, Grok CLI 등 다른 AI 도구를 설치하거나 실행하지 않는다. 하위 에이전트를 Codex라고 부르지 않는다.
4. 비밀키, 토큰, .env 파일 내용을 출력하지 않는다.
5. 유료 API, 크레딧 결제가 필요한 방법을 쓰지 않는다.
6. 할 일이 불분명하거나 저장소가 payload와 다르면 계획 대신 확인이 필요한 질문만 남긴다.

출력
마지막 메시지에 아래 JSON 하나만 ```json 코드블록으로 남긴다.
{ "task_id", "repository", "target_base_revision", "plan_revision": 1,
  "development_mode": "prototype_first" | "direct", "mode_reason": "한 줄 이유",
  "status": "planned" | "needs_clarification", "questions": [],
  "work_items": [ { "id", "title", "goal", "dependencies", "assignee_preference": "codex_primary|claude_support|gemini_optional|grok_optional",
                    "execution_mode": "codex_cloud|manual_handoff", "acceptance_tests", "preserve_constraints", "attachment_refs",
                    "requires_execution_approval": true } ] }
```

- **v0.4.2부터 계획은 자동으로 돌아온다**: `dispatch-claude`가 payload 끝에 "계획 보내기" 절과 이 업무 전용 1회용 제출표(6시간, 3번까지, DB에는 해시만)를 붙인다. PM은 계획을 다 쓰면 `curl`로 `https://kmmicksimbredbyvdmvx.supabase.co/functions/v1/submit-plan`에 보낸다. 앱이 `parsePmPlan`으로 검증한 뒤 계획·배정으로 저장한다(E 승인 전 실행 없음).
  - **소유자 설정(한 번)**: PM 루틴("MinLab AI Office 업무 실행")이 쓰는 클라우드 환경의 Network access에서 `kmmicksimbredbyvdmvx.supabase.co`를 Allowed domains에 넣는다(또는 더 넓은 접속 수준). 안내: https://code.claude.com/docs/en/cloud-environments#network-access
  - 접속이 막히거나 형식이 틀리면 세션 링크를 열어 JSON을 복사하고, 업무 카드 → 진행 단계 3번에 붙여넣는다(예전 방식).
- 루틴 설정에는 여전히 저장소 쓰기 도구가 켜져 있을 수 있다. 루틴 화면에서 쓰기 도구를 끌 수 있는지 확인한다(미확인).

- 결과 검토에서 "수정 요청(Claude PM으로)"을 기록하면, 같은 기획서 버전으로 한 번 더 보낼 수 있다. payload에 `결과 vN 검토 후 사용자 수정 요청` 절이 붙고, PM은 그 내용을 반영한 새 계획(새 `plan_revision`)을 만든다. 새 계획의 작업은 E 승인을 다시 받는다.

## 개발 방식(v0.3.5, 새 플로우 07단계)

- 저장 프롬프트를 바꾸지 않아도 `dispatch-claude`가 보내는 payload 끝에 "개발 방식 결정" 절이 붙는다. PM은 `development_mode`와 `mode_reason`을 계획 JSON에 넣는다.
- `prototype_first`: 첫 작업을 `gemini_optional`(AI Studio Build 견본)으로, Codex 작업은 그 뒤에 `dependencies`로 잇는다. 앱에서 견본을 올리고 **P(견본 승인)** 해야 Codex 작업을 E 승인할 수 있다(DB `0014_prototype_first.sql`).
- `direct`(또는 값 없음): 지금처럼 Codex로 바로.

## 보조 개발 루틴(v0.3.8)

- **v0.4.3 결과 자동 저장**: `dispatch-claude-dev`가 payload 끝에 "결과 보내기" 절과 이 작업 전용 1회용 제출표(24시간, 3번까지)를 붙인다. 세션이 시험까지 끝나면 `submit-result`로 결과를 보내고 앱이 결과 패키지로 저장한다. **소유자 설정**: 보조 개발 루틴이 쓰는 클라우드 환경 Network access에도 `kmmicksimbredbyvdmvx.supabase.co`를 허용한다(PM 루틴과 같은 환경이면 이미 됨).

루틴 `MinLab AI Office 보조 개발`(trig_01GC5Hzeaj3razY5wM7ZF9n1, 2026-10-30 생성, 일정 없음). PM 계획에서 Claude(`claude_support`)에 배정한 작업을
E 승인 뒤 앱의 **"Claude 보조 개발 시작(자동)"**으로 서버(`supabase/functions/dispatch-claude-dev`)가 시작한다.

- 저장 프롬프트 요지: payload의 작업 브랜치(`ai/claude/<업무 8자>-<작업>`)에서만 작업, **B 승인 전 push·PR·병합·배포 금지**, 시험 결과 그대로, 마지막 메시지에 요약·바뀐 파일·`git diff main...HEAD`·시험 로그·남은 문제.
- payload는 `dispatch-claude-dev/payload.ts`가 만든다(기획서·작업 목표·완료 기준·유지 조건·요청 자료 목록·승인된 견본).
- 예약은 DB `claim_claude_dev`(0016)가 원자적으로: 최신 계획·E 승인·시작 준비 상태·하루 상한(PM과 함께 셈)·동시 작업 상한·앞 작업.
- 세션 시작(HTTP 200)은 서버가 확인해 '시작됨'(server_verified)까지만 기록한다. 완료가 아니다. 결과는 세션 마지막 보고를 결과 패키지로 옮긴다.
- B 승인 뒤 앱의 **"Claude PR 요청 복사"**를 같은 세션에 붙여넣으면 작업 브랜치를 푸시하고 PR을 연다(병합 안 함).

소유자가 claude.ai 루틴 화면에서 할 일(한 번):
1. 이 루틴에 저장소 `minho-nim/MinLab-AI-Office`를 연결한다(PM 루틴과 같게).
2. API 트리거 토큰을 발급한다.
3. Supabase Edge Function secrets에 `CLAUDE_SUPPORT_FIRE_URL`(`https://api.anthropic.com/v1/claude_code/routines/trig_01GC5Hzeaj3razY5wM7ZF9n1/fire`)과 `CLAUDE_SUPPORT_TOKEN`(발급한 토큰)을 넣는다. 토큰은 채팅·코드에 남기지 않는다.
없으면 앱은 "보조 개발 루틴이 아직 연결되지 않았습니다"라고 알리고 수동 인계로 진행한다.
