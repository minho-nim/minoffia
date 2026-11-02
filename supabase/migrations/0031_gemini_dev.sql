-- MinLab AI Office v0.4.82 Gemini 개발(소유자 2026-11-02 "다음 단계 ㄱ"): PM이 쉬운 일(난이도 1~3)을 Gemini에 맡기면,
-- 실행 승인(E) 뒤 서버(dispatch-gemini-dev)가 GitHub Actions 워크플로(gemini-dev.yml, Gemini CLI·무료 키)를 시작한다.
-- 워크플로는 작업 브랜치(ai/gemini/…)만 push하고 결과를 submit-result로 보낸다. PR·병합·배포는 올리기·배포 승인 뒤.
-- 견본(AI Studio, gemini + manual_handoff)과 구별하려고 실행 방식 'gemini_actions'를 더한다.

alter table public.agent_assignments drop constraint if exists agent_assignments_execution_mode_check;
alter table public.agent_assignments add constraint agent_assignments_execution_mode_check
  check (execution_mode in ('codex_cloud', 'manual_handoff', 'gemini_actions'));

-- Gemini 워크플로가 직접 보낸 결과의 출처
alter table public.result_packages drop constraint if exists result_packages_source_check;
alter table public.result_packages add constraint result_packages_source_check
  check (source in ('codex_cloud_manual', 'claude_manual', 'claude_session_auto', 'gemini_actions_auto', 'manual'));

-- 예약(원자적): 최신 계획·E 승인·시작 준비·하루 상한(Gemini 개발만 따로 셈)을 확인하고 '시작 중'으로 바꾸며 실행 1회를 기록한다.
-- p_agent = 실제로 쓸 키의 캐릭터(studioA = 키 A, studioB = 키 B). 동시 작업 상한·앞 작업 규칙은 agent_assignments_guard(0009)가 지킨다.
create or replace function public.claim_gemini_dev(
  p_assignment uuid,
  p_owner uuid,
  p_allow_retry boolean,
  p_cap integer,
  p_agent text
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
  if p_agent not in ('studioA', 'studioB') then
    return query select false, 'bad_agent';
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('gemini-dev:' || p_owner::text));

  select * into v_a from agent_assignments where id = p_assignment and owner_id = p_owner;
  if not found or v_a.assignee <> 'gemini' or v_a.execution_mode <> 'gemini_actions' then
    return query select false, 'not_gemini_dev';
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

  -- 하루 상한: Gemini 개발 실행(usage_runs agent studioA·studioB, kind 'cloud')만 센다.
  select count(*) into v_count
  from usage_runs
  where owner_id = p_owner and agent in ('studioA', 'studioB') and kind = 'cloud'
    and day = (now() at time zone 'Asia/Seoul')::date;
  if v_count >= p_cap then
    return query select false, 'daily_cap';
    return;
  end if;

  update agent_assignments set dispatch_status = 'starting', started_at = now() where id = p_assignment;
  insert into usage_runs (owner_id, agent, task_id, kind) values (p_owner, p_agent, v_a.task_id, 'cloud');
  return query select true, 'claimed';
end;
$$;

revoke all on function public.claim_gemini_dev(uuid, uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.claim_gemini_dev(uuid, uuid, boolean, integer, text) to service_role;
