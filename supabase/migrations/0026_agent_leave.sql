-- MinLab AI Office v0.4.39: AI 휴가(소유자 2026-11-01).
-- 소유자가 AI를 '휴가'로 두면 새 배정(앱 규칙)과 PM 계획(dispatch-claude)에서 그 AI를 빼고,
-- 규칙대로 일할 수 있는 다른 AI에게 맡긴다. 이미 진행 중인 업무는 건드리지 않는다.
-- 행이 있으면 휴가, 없으면 근무. 미니엉(접수)·CI 봇은 휴가 대상이 아니다.

create table public.agent_leave (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent text not null check (agent in ('claude', 'codex', 'grok', 'studioA', 'studioB')),
  created_at timestamptz not null default now(),
  primary key (owner_id, agent)
);

alter table public.agent_leave enable row level security;

create policy agent_leave_select on public.agent_leave for select to authenticated using (owner_id = (select auth.uid()));
create policy agent_leave_insert on public.agent_leave for insert to authenticated with check (owner_id = (select auth.uid()));
create policy agent_leave_delete on public.agent_leave for delete to authenticated using (owner_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_leave') then
    alter publication supabase_realtime add table public.agent_leave;
  end if;
end $$;
