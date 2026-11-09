-- v0.6.11 서버에서 계획 바로 받기: submit-plan(서버 키)이 save_pm_plan과 같은 규칙으로 계획·작업을 한 번에 저장한다.
-- 로그인 사용자가 없으므로 소유자를 인자로 받고, 업무가 그 소유자 것인지 확인한다. 서버(service_role)만 실행할 수 있다.
create or replace function public.save_pm_plan_as(p_owner uuid, p_plan jsonb, p_assignments jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_task uuid := (p_plan->>'task_id')::uuid;
  v_revision integer := (p_plan->>'plan_revision')::integer;
  v_items jsonb := p_plan->'plan'->'work_items';
begin
  if p_owner is null then raise exception 'owner required'; end if;
  perform 1 from tasks where id = v_task and owner_id = p_owner for update;
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
  insert into pm_plans(id, owner_id, task_id, plan_revision, approved_spec_revision, target_base_revision, source, plan)
    values ((p_plan->>'id')::uuid, p_owner, v_task, v_revision, (p_plan->>'approved_spec_revision')::integer,
      coalesce(p_plan->>'target_base_revision',''), p_plan->>'source', p_plan->'plan');
  insert into agent_assignments(id, owner_id, task_id, plan_revision, work_item_id, title, assignee, execution_mode, dispatch_status)
    select (x->>'id')::uuid, p_owner, v_task, v_revision, x->>'work_item_id', coalesce(x->>'title',''),
      x->>'assignee', x->>'execution_mode', 'awaiting_user_execution_approval'
    from jsonb_array_elements(p_assignments) x;
end;
$$;
revoke all on function public.save_pm_plan_as(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_pm_plan_as(uuid, jsonb, jsonb) to service_role;
