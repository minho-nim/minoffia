-- v0.4.5 (소유자 승인 2026-10-31) 사용자 손작업 줄이기
-- (다) C(배포 승인)에 PR 병합을 포함: C는 'CI 성공'인 열린 PR(또는 이미 병합된 PR)이면 승인할 수 있고,
--      승인 뒤 서버(deploy-release)가 CI를 다시 확인하고 병합한 다음 release를 앞당긴다.
-- (나) B(올리기 승인) 뒤 서버(dispatch-claude-pr)가 Claude 보조 개발 루틴으로 승인된 변경 내용 그대로 PR을 연다.
--      같은 결과 버전으로 두 번 열지 않도록 pr_dispatches로 예약한다(하루 상한은 Claude 실행과 함께 셈).

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

create table public.pr_dispatches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  result_revision integer not null check (result_revision >= 1),
  branch text not null default '' check (char_length(branch) <= 200),
  session_url text,
  status text not null default 'starting' check (status in ('starting', 'started', 'failed')),
  error text not null default '' check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  unique (task_id, result_revision)
);
alter table public.pr_dispatches enable row level security;
create policy pr_dispatches_select on public.pr_dispatches for select to authenticated using (owner_id = (select auth.uid()));
-- 쓰기는 서버(service_role)만.

-- 올리기 승인(B)된 최신 Claude 결과로 PR 세션을 한 번만 예약한다. 실패한 예약은 p_allow_retry일 때만 다시.
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
  if v_r.source not in ('claude_session_auto', 'claude_manual') then
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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pr_dispatches') then
    alter publication supabase_realtime add table public.pr_dispatches;
  end if;
end $$;
