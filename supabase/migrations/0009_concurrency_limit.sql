-- MinLab AI Office v0.2.11: 동시 개발 작업 규칙(v0.2 §6, 소유자 결정 2026-10-30)
-- AI별 동시 작업 상한: 같은 AI(assignee)에게 시작(starting·started)된 작업이 상한만큼 있으면 그 AI의 다른 작업을 시작하지 못한다.
--   Codex Cloud·Claude Code는 여러 작업을 동시에 돌릴 수 있으므로 기본 상한은 Codex 3, Claude 3, Gemini 2, Grok 1.
--   소유자가 agent_limits에서 AI별로 1~5로 바꿀 수 있다. 다른 AI끼리는 서로 세지 않는다.
-- 순서 지키기: PM 계획의 dependencies에 적힌 작업이 끝나기(completed) 전에는 시작하지 못한다(같은 파일 충돌 방지).
-- 결과를 등록(completed)하거나 중단(failed)을 기록하면 풀린다. 서버(service_role)도 같은 규칙을 따른다.

-- AI별 동시 작업 상한(소유자가 바꿈). 행이 없으면 기본값을 쓴다.
create table public.agent_limits (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  assignee text not null check (assignee in ('codex', 'claude', 'gemini', 'grok')),
  max_running integer not null check (max_running between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (owner_id, assignee)
);

alter table public.agent_limits enable row level security;

create policy agent_limits_select on public.agent_limits for select to authenticated using (owner_id = (select auth.uid()));
create policy agent_limits_insert on public.agent_limits for insert to authenticated with check (owner_id = (select auth.uid()));
create policy agent_limits_update on public.agent_limits for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create or replace function public.agent_assignments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
  v_running integer;
  v_cap integer;
  v_waiting text;
begin
  if tg_op = 'UPDATE' then
    new.task_id := old.task_id;
    new.owner_id := old.owner_id;
    new.plan_revision := old.plan_revision;
    new.work_item_id := old.work_item_id;
    new.assignee := old.assignee;
    new.execution_mode := old.execution_mode;
  end if;
  if not v_is_service then
    -- 서버가 확인한 상태처럼 꾸밀 수 없다.
    if new.status_source = 'server_verified' or new.last_verified_at is distinct from (case when tg_op = 'UPDATE' then old.last_verified_at else null end) then
      raise exception 'only the server can record verified provider status';
    end if;
    if new.dispatch_status in ('starting', 'started', 'completed') and not exists (
      select 1 from approvals a
      where a.task_id = new.task_id and a.gate = 'E' and a.decision = 'approved'
        and a.approved_revision = new.plan_revision and a.work_item_id = new.work_item_id
    ) then
      raise exception 'E approval required before recording execution';
    end if;
  end if;
  -- 새로 시작하는 경우에만 센다(이미 시작된 작업의 다른 값 수정은 막지 않는다).
  if new.dispatch_status in ('starting', 'started')
     and (tg_op = 'INSERT' or old.dispatch_status not in ('starting', 'started')) then
    select count(*) into v_running from agent_assignments
    where owner_id = new.owner_id and assignee = new.assignee and dispatch_status in ('starting', 'started') and id <> new.id;
    v_cap := coalesce(
      (select l.max_running from agent_limits l where l.owner_id = new.owner_id and l.assignee = new.assignee),
      case new.assignee when 'codex' then 3 when 'claude' then 3 when 'gemini' then 2 else 1 end
    );
    if v_running >= v_cap then
      raise exception 'concurrent execution limit: this AI already has % running work item(s)', v_running;
    end if;
    -- 계획에 적힌 앞 작업(dependencies)이 모두 끝나야 시작한다.
    select string_agg(dep, ', ') into v_waiting
    from pm_plans p,
      jsonb_array_elements(coalesce(p.plan -> 'work_items', '[]'::jsonb)) as item,
      jsonb_array_elements_text(coalesce(item -> 'dependencies', '[]'::jsonb)) as dep
    where p.task_id = new.task_id and p.plan_revision = new.plan_revision and item ->> 'id' = new.work_item_id
      and not exists (
        select 1 from agent_assignments d
        where d.task_id = new.task_id and d.plan_revision = new.plan_revision and d.work_item_id = dep and d.dispatch_status = 'completed'
      );
    if v_waiting is not null then
      raise exception 'dependency not finished: %', v_waiting;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.agent_assignments_guard() from public, anon, authenticated;
