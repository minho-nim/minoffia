-- MinLab AI Office v0.5.2 Codex를 Linear로 맡기기(소유자 2026-11-03 "ㄱㄱ", 결정 docs/CODEX_LINEAR_DECISION_2026-10-30.md).
-- 실행 승인(E)된 Codex 작업을 서버(codex-linear)가 Linear 이슈로 만들고 Codex에게 맡긴다. 같은 작업을 두 번 맡기지 않게 원자적으로 예약한다.
-- Codex 사용 한도는 OpenAI가 관리하므로 여기서는 세지 않는다(실패 메시지는 업무 카드에 보인다).
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
  update agent_assignments set dispatch_status = 'starting', started_at = now() where id = p_assignment;
  insert into usage_runs (owner_id, agent, task_id, kind) values (p_owner, 'codex', v_a.task_id, 'cloud');
  return query select true, 'claimed';
end;
$$;

revoke all on function public.claim_codex_linear(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_codex_linear(uuid, uuid, boolean) to service_role;
