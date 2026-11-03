# Codex 자동 실행: 사전 진단과 결정 (2026-10-30, Asia/Seoul)

목표(소유자): E 실행 승인만 누르면 Codex Cloud 작업 생성 → 상태 확인 → 결과 회수 → 결과 검토까지 자동. PC가 꺼져 있어도 되고, ChatGPT Plus 구독 안(추가 결제 0원), 공식 인증만.

## 1. 사전 진단 (코드·운영 변경 없이 조사만)

실제 확인 / 문서상 가능 / 미검증을 나눈다. 이 세션은 네트워크 정책으로 `developers.openai.com`·`linear.app`을 직접 열지 못해 공식 문서는 웹 검색으로 확인했다.

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 진단 실행 환경 | 실제 확인 | Codex Cloud가 아니라 Claude Code 클라우드 컨테이너. `codex` CLI 없음(설치·실행하지 않음) |
| 저장소·기준 | 실제 확인 | `minho-nim/minlab-ai-office`, `main` = `release` = `7e845c3`(v0.4.2) |
| `codex cloud exec/status/list/diff/apply` | 소스 확인 | `CLOUD_CODEX_DISPATCH_VERIFICATION_2026-10-29.md` |
| Codex 클라우드 작업 인증 | 문서상 | ChatGPT 로그인 필요. 무인 서버용 공식 구독 인증 없음(기기 코드 로그인은 베타·사람 승인, `auth.json` 복사는 토큰 재사용이라 금지). API 키는 사용량 과금 |
| 개인 Plus로 서버 무인 실행 | **불가** | 위 인증 문제. Supabase Edge·Cloudflare에서는 CLI 실행 불가, GitHub Actions는 로그인 파일 보관·B 전 업로드 문제 |
| Codex for Linear (Plus 사용) | 문서상 가능 | 이슈를 Codex에 배정(위임)하면 클라우드 작업 시작, 진행 소식을 Linear에 게시, 완료 시 **요약 + Codex 작업 링크**. PR은 자동 생성하지 않음(사용자가 작업에서 만듦) |
| Linear 무료 플랜의 API·웹훅·에이전트 | 문서상(미확정) | 요금표에 표시, 이슈 250개 제한 |
| 서버(API)가 위임해도 Codex가 시작하는지 | **미검증** | 트리아지 자동 배정은 "이슈 작성자 계정으로 실행"(공식). API 위임 필드 `delegateId`는 제3자 자료만 |
| diff·바뀐 파일·시험 기록 자동 회수 | **Linear로는 불가** | Linear에는 요약과 링크만 옴 |

결론: 원래 조건(결과 검토 전 diff 자동 회수까지)을 모두 만족하는 공식 경로는 없다. 막힌 원인은 OpenAI 쪽(구독용 서버 인증 없음, Linear로 결과 전체를 보내지 않음).

## 2. 결정 (소유자 2026-10-30): 절충안 "Linear로 시작·상태, diff는 B 뒤 PR에서"

1. **E 승인** → 서버가 Linear 이슈(Codex 지시서)를 만들고 Codex에 위임한다. E 승인 전에는 아무것도 만들지 않는다.
2. Codex가 Linear에 올리는 진행 소식과 Codex 작업 링크를 서버가 읽어 업무 카드에 보인다. **실제로 확인한 상태만** 표시한다(위임만 하고 Codex 응답이 없으면 '시작됨'이 아님).
3. 완료되면 Codex 요약을 결과 패키지로 자동 등록한다. 출처를 따로 표시하고 "diff는 B 승인 뒤 PR에서 확인"이라고 적는다.
4. **B 승인** → PR 생성 → 기존 `pr-status`가 GitHub에서 diff·CI를 자동 확인 → **C 승인** → 배포.

원래 조건 7("결과 검토 전에 diff 자동 회수")은 이 결정으로 "B 승인 뒤 PR에서 diff 자동 확인"으로 바뀐다.

## 3. 소유자 설정 (진행 중)

1. Linear 무료 워크스페이스·팀 만들기. 가입 중 Linear의 GitHub 연결은 건너뜀(Codex는 자기 GitHub 연결을 씀).
2. ChatGPT Codex 설정에서 **Codex for Linear** 설치(또는 linear.app/integrations/codex).
3. Linear 이슈 댓글에 `@Codex`로 계정 연결.
4. Linear Personal API key 발급 → Supabase Edge Function secret `LINEAR_API_KEY`(채팅·코드에 남기지 않음).

## 4. 구현 순서 (검증 먼저)

1. 시험 기능: 서버가 Linear에서 Codex 사용자와 위임 필드를 찾을 수 있는지만 확인(작업 시작 없음). **v0.4.11에 만들어 둠**: 에이전트 탭 → Codex → "Linear 연결 확인"(`linear-probe`). 키를 넣은 뒤 누르면 된다.
2. 작은 시험 업무로 서버 위임 → Codex 실제 시작 여부를 계정에서 실측.
3. 되면 본 기능(위임·상태 동기화·결과 자동 등록·중복 방지·하루 상한). 안 되면 막힌 단계와 이유를 기록하고 구현하지 않는다.
4. 기존 코드 개선: 결과 패키지를 실행 기록(공급자 작업 ID)에 연결하고, 사용자가 손으로 등록한 결과는 B 화면에 표시.

## 출처

- https://developers.openai.com/codex/integrations/linear
- https://linear.app/integrations/codex
- https://learn.chatgpt.com/docs/third-party/linear.md
- https://developers.openai.com/codex/auth
- https://linear.app/pricing
- https://linear.app/developers/agents.md
- https://linear.app/developers/graphql.md
