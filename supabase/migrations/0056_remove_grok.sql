-- Grok 완전히 빼기(v0.7.3, 소유자 2026-11-13 "그록은 완전 빼자"): 무료 자동 호출이 안 돼 한 번도 업무를 맡지 않았다.
-- 남아 있던 휴가·동시 실행 상한 줄을 지우고, 담당 값 목록에서 grok을 뺀다(업무·실행 기록에는 grok 값이 없다, 2026-11-13 확인).
delete from public.agent_leave where agent = 'grok';
delete from public.agent_limits where assignee = 'grok';

alter table public.tasks drop constraint if exists tasks_assignee_check;
alter table public.tasks add constraint tasks_assignee_check check (assignee in ('mina', 'claude', 'codex', 'studioA', 'studioB', 'ci'));
alter table public.usage_runs drop constraint if exists usage_runs_agent_check;
alter table public.usage_runs add constraint usage_runs_agent_check check (agent in ('mina', 'claude', 'codex', 'studioA', 'studioB', 'ci'));
alter table public.agent_assignments drop constraint if exists agent_assignments_assignee_check;
alter table public.agent_assignments add constraint agent_assignments_assignee_check check (assignee in ('codex', 'claude', 'gemini'));
alter table public.agent_limits drop constraint if exists agent_limits_assignee_check;
alter table public.agent_limits add constraint agent_limits_assignee_check check (assignee in ('codex', 'claude', 'gemini'));
alter table public.agent_leave drop constraint if exists agent_leave_agent_check;
alter table public.agent_leave add constraint agent_leave_agent_check check (agent in ('claude', 'codex', 'studioA', 'studioB'));
