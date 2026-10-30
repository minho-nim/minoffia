-- MinLab AI Office v0.3.8: Claude 보조 개발 자동 시작(두 번째 루틴 'MinLab AI Office 보조 개발').
-- PM 계획에서 Claude(claude_support)에 배정한 작업을, E 승인 뒤 서버(dispatch-claude-dev)가 루틴으로 시작한다.
-- 예약은 원자적으로: 최신 계획·E 승인·시작 준비 상태·하루 상한(PM과 함께 셈)을 확인하고 '시작 중'으로 바꾸며 실행 1회를 기록한다.
-- 동시 작업 상한·앞 작업(dependencies) 규칙은 agent_assignments_guard(0009)가 그대로 지킨다.

create or replace function public.claim_claude_dev(
  p_assignment uuid,
  p_owner uuid,
  p_allow_retry boolean,
  p_cap integer
)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.agent_assignments;
  v_plan integer;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('claude-dispatch:' || p_owner::text));

  select * into v_a from agent_assignments where id = p_assignment and owner_id = p_owner;
  if not found or v_a.assignee <> 'claude' then
    return query select false, 'not_claude';
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

  -- 하루 상한은 PM 전송과 함께 센다(Claude 클라우드 실행 = usage_runs agent 'claude', kind 'cloud').
  select count(*) into v_count
  from usage_runs
  where owner_id = p_owner and agent = 'claude' and kind = 'cloud'
    and day = (now() at time zone 'Asia/Seoul')::date;
  if v_count >= p_cap then
    return query select false, 'daily_cap';
    return;
  end if;

  -- 동시 작업 상한·앞 작업 미완료면 agent_assignments_guard가 오류를 낸다.
  update agent_assignments set dispatch_status = 'starting', started_at = now() where id = p_assignment;
  insert into usage_runs (owner_id, agent, task_id, kind) values (p_owner, 'claude', v_a.task_id, 'cloud');
  return query select true, 'claimed';
end;
$$;

revoke all on function public.claim_claude_dev(uuid, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.claim_claude_dev(uuid, uuid, boolean, integer) to service_role;
