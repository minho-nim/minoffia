-- MinLab AI Office v0.2.11: 동시 개발 작업 기본 1개(v0.2 §6)
-- 이미 시작(starting·started)된 작업이 있으면 다른 작업을 시작으로 기록하지 못한다.
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
    where owner_id = new.owner_id and dispatch_status in ('starting', 'started') and id <> new.id;
    if v_running >= 1 then
      raise exception 'concurrent execution limit: finish or stop the running work item first';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.agent_assignments_guard() from public, anon, authenticated;
