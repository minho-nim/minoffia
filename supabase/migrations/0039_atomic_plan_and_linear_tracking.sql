-- 계획과 배정을 한 트랜잭션으로 저장한다. 호출자의 RLS·기존 승인 트리거를 그대로 적용한다.
create function public.save_pm_plan(p_plan jsonb, p_assignments jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_task uuid := (p_plan->>'task_id')::uuid;
  v_revision integer := (p_plan->>'plan_revision')::integer;
  v_items jsonb := p_plan->'plan'->'work_items';
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  perform 1 from tasks where id = v_task and owner_id = auth.uid() for update;
  if not found then raise exception 'task does not belong to owner'; end if;
  if jsonb_typeof(v_items) is distinct from 'array' or jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'plan work items and assignments must be arrays';
  end if;
  if jsonb_array_length(v_items) <> jsonb_array_length(p_assignments)
    or (select count(distinct x->>'id') from jsonb_array_elements(v_items) x) <> jsonb_array_length(v_items)
    or (select count(distinct x->>'work_item_id') from jsonb_array_elements(p_assignments) x) <> jsonb_array_length(p_assignments)
    or exists (
      select x->>'id' from jsonb_array_elements(v_items) x
      except select x->>'work_item_id' from jsonb_array_elements(p_assignments) x
    ) then raise exception 'assignments must match all plan work items';
  end if;
  insert into pm_plans(id, task_id, plan_revision, approved_spec_revision, target_base_revision, source, plan)
    values ((p_plan->>'id')::uuid, v_task, v_revision, (p_plan->>'approved_spec_revision')::integer,
      coalesce(p_plan->>'target_base_revision',''), p_plan->>'source', p_plan->'plan');
  insert into agent_assignments(id, task_id, plan_revision, work_item_id, title, assignee, execution_mode, dispatch_status)
    select (x->>'id')::uuid, v_task, v_revision, x->>'work_item_id', coalesce(x->>'title',''),
      x->>'assignee', x->>'execution_mode', 'awaiting_user_execution_approval'
    from jsonb_array_elements(p_assignments) x;
end;
$$;
revoke all on function public.save_pm_plan(jsonb, jsonb) from public, anon;
grant execute on function public.save_pm_plan(jsonb, jsonb) to authenticated;

-- Linear 이슈 식별자는 외부 요청 전에 예약한다. 실패 후 재시도도 같은 UUID를 사용한다.
create or replace function public.claim_codex_linear(
  p_assignment uuid,
  p_owner uuid,
  p_allow_retry boolean
)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.agent_assignments;
  v_plan integer;
begin
  perform pg_advisory_xact_lock(hashtext('codex-linear:' || p_owner::text));
  select * into v_a from agent_assignments where id = p_assignment and owner_id = p_owner;
  if not found or v_a.assignee <> 'codex' then
    return query select false, 'not_codex';
    return;
  end if;
  select max(plan_revision) into v_plan from pm_plans where task_id = v_a.task_id;
  if v_a.plan_revision <> v_plan then
    return query select false, 'stale_plan';
    return;
  end if;
  if not exists (
    select 1 from approvals a
    where a.task_id = v_a.task_id and a.gate = 'E' and a.decision = 'approved'
      and a.approved_revision = v_a.plan_revision and a.work_item_id = v_a.work_item_id
  ) then
    return query select false, 'not_approved';
    return;
  end if;
  if not (v_a.dispatch_status = 'ready' or (v_a.dispatch_status = 'failed' and p_allow_retry)) then
    return query select false, 'not_claimable';
    return;
  end if;
  update agent_assignments set
    dispatch_status = 'starting', started_at = now(),
    provider_execution_id = case
      when provider_execution_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then provider_execution_id else gen_random_uuid()::text end,
    provider_task_url = case when provider_execution_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then provider_task_url else null end,
    actual_provider_status = 'linear: 이슈 전송 예약(아직 생성 확인 전)'
  where id = p_assignment;
  insert into usage_runs (owner_id, agent, task_id, kind) values (p_owner, 'codex', v_a.task_id, 'cloud');
  return query select true, 'claimed';
end;
$$;

revoke all on function public.claim_codex_linear(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_codex_linear(uuid, uuid, boolean) to service_role;
