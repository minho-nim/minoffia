-- MinLab AI Office v0.2.11: 동시 개발 작업 규칙(v0.2 §6, 소유자 결정 2026-10-30)
-- AI마다 동시에 1개: 같은 AI(assignee)에게 이미 시작(starting·started)된 작업이 있으면 그 AI의 다른 작업을 시작하지 못한다.
--   다른 AI끼리는 동시에 진행할 수 있다(여러 AI에게 나눠 맡기는 목표).
-- 순서 지키기: PM 계획의 dependencies에 적힌 작업이 끝나기(completed) 전에는 시작하지 못한다(같은 파일 충돌 방지).
-- 결과를 등록(completed)하거나 중단(failed)을 기록하면 풀린다. 서버(service_role)도 같은 규칙을 따른다.

create or replace function public.agent_assignments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
  v_running integer;
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
    if v_running >= 1 then
      raise exception 'concurrent execution limit: this AI already has a running work item';
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
