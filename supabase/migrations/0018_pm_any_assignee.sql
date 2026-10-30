-- v0.3.9 Claude PM 전송은 업무의 처음 배정(입력창 규칙이 고른 AI)과 상관없이 한다.
-- v0.2.1부터 PM은 늘 Claude이고, 실제 담당은 PM 계획의 배정(agent_assignments)이 정한다.
-- 0003의 claim_claude_dispatch에서 "assignee = 'claude'" 조건만 뺀다(나머지 규칙은 그대로).
create or replace function public.claim_claude_dispatch(
  p_task uuid,
  p_owner uuid,
  p_allow_retry boolean,
  p_cap integer,
  p_spec_revision integer
)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('claude-dispatch:' || p_owner::text));

  if not exists (
    select 1 from approvals a
    where a.task_id = p_task and a.owner_id = p_owner and a.gate = 'A'
      and a.decision = 'approved' and a.approved_revision = p_spec_revision
  ) or p_spec_revision <> (select max(revision) from task_specs where task_id = p_task) then
    return query select false, 'not_approved';
    return;
  end if;

  select count(*) into v_count
  from usage_runs
  where owner_id = p_owner and agent = 'claude' and kind = 'cloud'
    and day = (now() at time zone 'Asia/Seoul')::date;
  if v_count >= p_cap then
    return query select false, 'daily_cap';
    return;
  end if;

  update tasks
  set dispatch_state = 'dispatching',
      dispatch_error = null,
      dispatch_at = now(),
      dispatch_spec_revision = p_spec_revision,
      stage = 'dispatching'
  where id = p_task
    and owner_id = p_owner
    and status <> 'done'
    and (
      dispatch_state = 'none'
      or (dispatch_state = 'failed' and p_allow_retry)
      -- 새로 승인된 기획서 버전은 다시 PM에 보낼 수 있다.
      or (dispatch_state in ('dispatched', 'failed') and coalesce(dispatch_spec_revision, 0) < p_spec_revision)
      -- 같은 버전이라도, 마지막 전송 뒤에 결과 수정 요청이 있으면 한 번 더 보낼 수 있다.
      or (dispatch_state = 'dispatched' and dispatch_spec_revision = p_spec_revision and exists (
        select 1 from revision_requests r
        where r.task_id = p_task and r.spec_revision = p_spec_revision and r.created_at > coalesce(tasks.dispatch_at, '-infinity'::timestamptz)
      ))
    );
  if not found then
    return query select false, 'not_claimable';
    return;
  end if;

  insert into usage_runs (owner_id, agent, task_id, kind) values (p_owner, 'claude', p_task, 'cloud');
  return query select true, 'claimed';
end;
$$;

revoke all on function public.claim_claude_dispatch(uuid, uuid, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_claude_dispatch(uuid, uuid, boolean, integer, integer) to service_role;
