# 클라우드·요금 제한 확인표 (2026-10-29, Asia/Seoul)

v0.2 지시서 §9. `검증됨` = 공식 문서 확인 **그리고** 사용자 계정에서 실제 동작 확인. `문서 확인` = 공식 문서·소스만 확인. `미확인` = 이 세션에서 문서를 읽지 못했거나 계정에서 시험하지 못함.

이 세션의 네트워크 허용 목록에 없어 읽지 못한 사이트: `developers.openai.com`, `help.openai.com`, `ai.google.dev`, `developers.cloudflare.com`, `supabase.com`(커넥터 문서 검색으로 대신 확인). 다음 검증 때 허용하면 다시 확인한다.

| # | 서비스 | 공식 URL | 계정 실측 | 비용 | 판정 | 재현 방법 / 후속 조치 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Pro Routines (HTTP 트리거) | https://platform.claude.com/docs/en/api/claude-code/routines-fire | 예. 2026-10-29 세션 2개 생성 | 구독 사용량(추가 0원) | **검증됨**(세션 시작) / 결과 자동 회수 **불가** | 응답은 세션 URL뿐이고 토큰에 읽기 권한이 없다. 루틴당 시간당 30회, 계정 100회. 비푸시 PM 계획은 프롬프트로 강제(쓰기 도구 끄기는 미확인) |
| 2 | ChatGPT Plus → AI Office 연결 | https://help.openai.com/en/articles/12515353-building-with-the-apps-sdk | 아니요 | — | **미확인** → 수동 인계 | Apps SDK/커넥터로 Supabase에 결과를 돌려주는 경로는 사용자 승인·권한 검증 전까지 `연결 대기`. 앱은 "ChatGPT용 자료 복사 → 결과 저장" 수동 경로로 동작 |
| 3 | Codex Cloud 원격 자동 시작 | https://developers.openai.com/codex/cli/reference (읽지 못함), 소스 `openai/codex@9cc14e7` | 아니요 | Plus 사용량 | `cloud exec` **문서(소스) 확인** / 자동 시작 **보류** | ChatGPT 로그인 전용 인증, 독립 실행기 없음. 사용자 PC에서 비파괴 시험 절차는 `CLOUD_CODEX_DISPATCH_VERIFICATION_2026-10-29.md` §3 |
| 4 | Gemini API (이미지 이해, A/B) | https://ai.google.dev/gemini-api/docs/rate-limits | 아니요 | 무료 범위만 | **미확인 / 미연결** | 무료 모델·RPM/RPD·프로젝트 단위 한도를 확인한 뒤 연결. 키를 늘리면 한도가 늘어난다고 가정하지 않는다 |
| 5 | Grok 무료 | — | 아니요 | — | **미연결** | 무인 실행 경로 미확인. 수동 인계만 |
| 6 | Supabase Free | https://supabase.com/docs/guides/functions/limits (커넥터로 확인) | 예(DB·Auth·RLS·Edge Function 운영 중) | 0원 | **검증됨**(현재 사용 범위) | Edge Function: 메모리 256MB, 실행 시간 150초, CPU 2초/요청, 함수 100개, secrets 100개. Storage(문서 확인 2026-10-29, https://supabase.com/docs/guides/storage/uploads/file-limits): 무료 1GB, 파일 하나 최대 50MB(전역), 대역폭 10GB(캐시 5GB + 비캐시 5GB). AI Office는 이미지 하나 5MB·합계 900MB로 더 낮게 막고, 서명 주소를 세션 동안 다시 써서 내려받기를 줄인다. 비활동 정지는 문서 재확인 필요. 결과 diff는 DB에 최대 500KB로 제한 |
| 7 | Cloudflare Pages Free | https://developers.cloudflare.com/pages/get-started/direct-upload/ | 예(Git 연동, `release` 브랜치 운영) | 0원 | Git 연동 **검증됨** / B 전 비공개 Preview **미확인** | Git 연동 Preview는 브랜치 푸시가 필요해 B 전 검토에 못 쓴다. Direct Upload는 별도 프로젝트로 검토(운영 프로젝트 전환 금지) |
| 8 | GitHub Free | — | 예(private 저장소, Actions `verify`, PR) | 0원 | **검증됨**(PR·CI) | 브랜치 보호 규칙은 미설정. C 승인 전 배포는 `release` 브랜치 분리로 막음 |
| 9 | PC 2대 꺼짐 + 모바일만 | — | 일부(모바일 접속·로그인 확인) | — | 아래 표 | — |

## PC가 모두 꺼져 있을 때

| 작업 | 가능? | 이유 |
| --- | --- | --- |
| 오피스 접속·업무 등록·승인 기록 | 예 | Cloudflare + Supabase |
| Claude PM 세션 시작 | 예 | Routines(클라우드) |
| PM 계획 가져오기 | 예(수동) | 휴대폰에서 세션을 열어 JSON 복사 → 붙여넣기 |
| Codex Cloud 작업 시작 | 예(수동) | Codex 웹/앱에서 사용자가 시작. 자동 시작은 불가 |
| `codex cloud exec`·`diff` | 아니요 | CLI가 설치된 PC가 켜져 있어야 함 |
| 운영 배포(`release` 갱신) | 아니요 | 지금은 PC의 git 명령으로만 |
