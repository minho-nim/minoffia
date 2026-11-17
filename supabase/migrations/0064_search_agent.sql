-- 웹 검색 자리 이름(v0.7.52, 소유자 2026-11-17 "@exa는 모두 삭제, 검색은 Tavily·Firecrawl 두 개로만"): 휴가 값 'exa' → 'search'.
-- 기존 휴가 행을 옮기고 값 목록을 바꾼다(소유자만 자기 행을 다루는 정책은 그대로).
alter table public.agent_leave drop constraint if exists agent_leave_agent_check;
update public.agent_leave set agent = 'search' where agent = 'exa';
alter table public.agent_leave add constraint agent_leave_agent_check check (agent in ('claude', 'codex', 'search', 'studioA', 'studioB'));
