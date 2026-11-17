-- 웹 검색 자리 이름(v0.7.52, 소유자 2026-11-17 "@exa는 모두 삭제, 검색은 Tavily·Firecrawl 두 개로만"): 휴가 값 'exa' → 'search'.
-- v0.7.53: Firecrawl(2단계 본문 읽기)도 따로 휴가를 줄 수 있다.
-- 기존 휴가 행을 옮기고 값 목록을 바꾼다(소유자만 자기 행을 다루는 정책은 그대로).
alter table public.agent_leave drop constraint if exists agent_leave_agent_check;
update public.agent_leave set agent = 'search' where agent = 'exa';
alter table public.agent_leave add constraint agent_leave_agent_check check (agent in ('claude', 'codex', 'search', 'firecrawl', 'studioA', 'studioB'));

-- v0.7.53 검색 사용 기록: ai_calls 공급자에 tavily·firecrawl(팀 관리의 이번 달 크레딧 추정). Gemini 사용량 계산은 공급자 gemini만 센다.
alter table public.ai_calls drop constraint if exists ai_calls_provider_check;
alter table public.ai_calls add constraint ai_calls_provider_check check (provider in ('gemini', 'tavily', 'firecrawl'));
