-- v0.4.20 꼬임 방지: 한 업무를 여러 AI가 나눠 할 때, 같은 계획의 다른 작업이 아직 진행 중이면 올리기 승인(B)을 막는다.
-- (먼저 온 결과만 PR로 나가고 나머지 작업이 빠지는 것을 막는다. 화면 규칙은 src/domain/workflow.ts canApprove('B')와 같다.)
-- 0022의 approvals_guard를 그대로 두고 B 조건 하나만 더한다.

create or replace function public.approvals_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec integer;
  v_plan integer;
  v_plan_spec integer;
  v_result integer;
  v_mode text;
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.owner_id = new.owner_id) then
    raise exception 'task does not belong to owner';
  end if;
  new.actor := coalesce(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''), new.actor);
  if new.decision <> 'approved' then
    return new;
  end if;

  select max(revision) into v_spec from task_specs where task_id = new.task_id;

  if new.gate = 'A' then
    if v_spec is null or new.approved_revision <> v_spec then
      raise exception 'A must approve the latest spec revision';
    end if;
    if (select intent from task_specs where task_id = new.task_id and revision = v_spec) in ('question', 'ambiguous') then
      raise exception 'question/ambiguous specs cannot be approved for development';
    end if;

  elsif new.gate in ('E', 'P') then
    select max(plan_revision) into v_plan from pm_plans where task_id = new.task_id;
    select approved_spec_revision, coalesce(plan ->> 'development_mode', 'direct') into v_plan_spec, v_mode
      from pm_plans where task_id = new.task_id and plan_revision = v_plan;
    if v_plan is null or new.approved_revision <> v_plan then
      raise exception '% must approve the latest plan revision', new.gate;
    end if;
    if v_plan_spec <> v_spec or not exists (
      select 1 from approvals a where a.task_id = new.task_id and a.gate = 'A' and a.decision = 'approved' and a.approved_revision = v_spec
    ) then
      raise exception 'plan is stale: latest spec is not A-approved';
    end if;

    if new.gate = 'P' then
      if v_mode <> 'prototype_first' then
        raise exception 'P is only for prototype_first plans';
      end if;
      if not exists (select 1 from attachments x where x.task_id = new.task_id and x.kind = 'prototype' and x.plan_revision = v_plan) then
        raise exception 'P requires an uploaded prototype';
      end if;
    else
      if new.work_item_id = '' or not exists (
        select 1 from agent_assignments s where s.task_id = new.task_id and s.plan_revision = v_plan and s.work_item_id = new.work_item_id
      ) then
        raise exception 'E must name a work item of the latest plan';
      end if;
      -- 시안 먼저: Codex 작업은 시안 승인(P) 뒤에만 실행 승인한다(시안을 보존하며 통합).
      if v_mode = 'prototype_first' and exists (
        select 1 from agent_assignments s
        where s.task_id = new.task_id and s.plan_revision = v_plan and s.work_item_id = new.work_item_id and s.assignee = 'codex'
      ) and not exists (
        select 1 from approvals a where a.task_id = new.task_id and a.gate = 'P' and a.decision = 'approved' and a.approved_revision = v_plan
      ) then
        raise exception 'prototype_first: approve the prototype (P) before Codex execution';
      end if;
    end if;

  elsif new.gate = 'B' then
    select max(revision) into v_result from result_packages where task_id = new.task_id;
    if v_result is null or new.approved_revision <> v_result then
      raise exception 'B must approve the latest result package';
    end if;
    if exists (select 1 from revision_requests r where r.task_id = new.task_id and r.result_revision = v_result) then
      raise exception 'B not allowed: revision was requested for this result';
    end if;
    -- v0.4.20: 같은 계획에서 실행 승인한 다른 작업이 아직 끝나지 않았으면(여러 AI가 나눠 할 때) 일부 결과만 올리지 않는다.
    if exists (
      select 1 from agent_assignments s
      where s.task_id = new.task_id
        and s.plan_revision = (select max(plan_revision) from pm_plans where task_id = new.task_id)
        and s.dispatch_status in ('ready', 'starting', 'started')
    ) then
      raise exception 'B not allowed: other work items of this plan are still running';
    end if;

  elsif new.gate = 'C' then
    select max(revision) into v_result from result_packages where task_id = new.task_id;
    if v_result is null or new.approved_revision <> v_result or not exists (
      select 1 from approvals a where a.task_id = new.task_id and a.gate = 'B' and a.decision = 'approved' and a.approved_revision = v_result
    ) then
      raise exception 'C requires B approval of the same result package';
    end if;
    -- 서버가 GitHub에서 확인한 최신 기록이 'CI 성공'이어야 한다. 병합은 C 승인 뒤 서버(deploy-release)가 한다(v0.4.5).
    -- 열린 PR(병합 전) 또는 이미 병합된 PR만. 병합 없이 닫힌 PR은 안 된다.
    if not exists (
      select 1 from (
        select c.ci_state, c.merged, c.pr_state, c.pr_url from pr_checks c
        where c.task_id = new.task_id order by c.checked_at desc limit 1
      ) last
      join tasks t on t.id = new.task_id and t.pr_url = last.pr_url
      where last.ci_state = 'success' and (last.merged or last.pr_state = 'open')
    ) then
      raise exception 'C requires a passing CI on an open or merged PR checked by the server';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.approvals_guard() from public, anon, authenticated;
