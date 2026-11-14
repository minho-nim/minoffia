-- Exa 휴가(v0.7.9, 소유자 2026-11-14 "exa 휴가 기능이 필요해"): 팀 관리에서 Exa도 휴가를 줄 수 있게 값 목록에 넣는다.
-- 휴가면 ask-gemini가 Exa를 부르지 않고 Gemini 검색 연결로 웹 조사를 한다.
alter table public.agent_leave drop constraint if exists agent_leave_agent_check;
alter table public.agent_leave add constraint agent_leave_agent_check check (agent in ('claude', 'codex', 'exa', 'studioA', 'studioB'));
