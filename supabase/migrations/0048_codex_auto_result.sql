-- MinLab AI Office v0.6.19(소유자 2026-11-10 "Codex 주, Claude 보조"): Codex(Linear)가 결과 제출표로 직접 보낸 결과.
-- 서버가 결과 패키지로 옮기고(source codex_linear_auto) Claude가 채점한다. 올리기 승인(B) 뒤에는 Claude가 승인된 diff 그대로 PR을 연다.

alter table public.result_packages drop constraint if exists result_packages_source_check;
alter table public.result_packages add constraint result_packages_source_check
  check (source in ('codex_cloud_manual', 'claude_manual', 'claude_session_auto', 'gemini_actions_auto', 'codex_linear_auto', 'manual'));

-- 올리기 승인(B)된 최신 결과로 Claude PR 세션을 한 번만 예약한다(0022와 같고 Codex 자동 결과도 받는다).
create or replace function public.claim_claude_pr(p_task uuid, p_owner uuid, p_allow_retry boolean, p_cap integer)
returns table (ok boolean, reason text, result_revision integer, work_item_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.result_packages;
  v_count integer;
  v_prev public.pr_dispatches;
  v_has boolean;
begin
  perform pg_advisory_xact_lock(hashtext('claude-dispatch:' || p_owner::text));
  select * into v_r from result_packages where task_id = p_task and owner_id = p_owner order by revision desc limit 1;
  if not found then
    return query select false, 'no_result', null::integer, null::text;
    return;
  end if;
  if v_r.source not in ('claude_session_auto', 'claude_manual', 'codex_linear_auto') then
    return query select false, 'not_claude', v_r.revision, v_r.work_item_id;
    return;
  end if;
  if not exists (select 1 from approvals a where a.task_id = p_task and a.gate = 'B' and a.decision = 'approved' and a.approved_revision = v_r.revision) then
    return query select false, 'not_approved', v_r.revision, v_r.work_item_id;
    return;
  end if;
  select * into v_prev from pr_dispatches d where d.task_id = p_task and d.result_revision = v_r.revision;
  v_has := found;
  if v_has and not (v_prev.status = 'failed' and p_allow_retry) then
    return query select false, 'already', v_r.revision, v_r.work_item_id;
    return;
  end if;
  select count(*) into v_count from usage_runs
    where owner_id = p_owner and agent = 'claude' and kind = 'cloud' and day = (now() at time zone 'Asia/Seoul')::date;
  if v_count >= p_cap then
    return query select false, 'daily_cap', v_r.revision, v_r.work_item_id;
    return;
  end if;
  if v_has then
    update pr_dispatches set status = 'starting', error = '', created_at = now() where id = v_prev.id;
  else
    insert into pr_dispatches (owner_id, task_id, result_revision) values (p_owner, p_task, v_r.revision);
  end if;
  insert into usage_runs (owner_id, agent, task_id, kind) values (p_owner, 'claude', p_task, 'cloud');
  return query select true, 'claimed', v_r.revision, v_r.work_item_id;
end;
$$;
revoke all on function public.claim_claude_pr(uuid, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.claim_claude_pr(uuid, uuid, boolean, integer) to service_role;
