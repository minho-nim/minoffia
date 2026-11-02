-- MinLab AI Office v0.4.93 PM 질문에 답하고 다시 보내기(소유자 2026-11-02 "견본 만들기 했는데 안 됨").
-- PM이 계획을 보류하고(status needs_clarification) 질문을 남기면, 소유자가 업무 카드·대화창에서 답한다(clarifications).
-- 그 답이 마지막 PM 전송 뒤에 있으면 같은 기획서 버전으로 한 번 더 PM에 보낼 수 있다(0018 규칙에 조건 하나 추가).
-- PM 지시서(dispatch-claude)는 이미 확인 질문·답변을 함께 넣는다.

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
      -- v0.4.93: PM이 계획을 보류하고 물은 것에 소유자가 답했으면(마지막 전송 뒤 확인 질문·답변) 같은 버전으로 다시 보낼 수 있다.
      or (dispatch_state = 'dispatched' and dispatch_spec_revision = p_spec_revision and exists (
        select 1 from clarifications c
        where c.task_id = p_task and c.created_at > coalesce(tasks.dispatch_at, '-infinity'::timestamptz)
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
