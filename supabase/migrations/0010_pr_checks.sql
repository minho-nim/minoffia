-- MinLab AI Office v0.2.14: PR CI 결과 자동 확인(v0.2 §8: PR 검사 실패 시 C 운영 배포 승인 비활성화)
-- 서버(Edge Function pr-status)가 GitHub에서 PR 상태와 CI(check runs)를 읽어 기록한다. 사용자는 기록할 수 없다.
-- C 승인은 이 업무의 PR 주소에 대한 최신 확인이 'CI 성공 + 병합됨'일 때만 된다.

create table public.pr_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  pr_url text not null check (pr_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$'),
  pr_state text not null check (pr_state in ('open', 'closed')),
  merged boolean not null,
  head_sha text not null default '',
  ci_state text not null check (ci_state in ('success', 'failure', 'pending', 'none')),
  checks jsonb not null default '[]'::jsonb check (jsonb_array_length(checks) <= 50),
  checked_at timestamptz not null default now()
);

create index pr_checks_task_idx on public.pr_checks (task_id, checked_at desc);

alter table public.pr_checks enable row level security;

-- 읽기만(기록은 서버만, 고칠 수 없음).
create policy pr_checks_select on public.pr_checks for select to authenticated using (owner_id = (select auth.uid()));

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

  elsif new.gate = 'E' then
    select max(plan_revision) into v_plan from pm_plans where task_id = new.task_id;
    select approved_spec_revision into v_plan_spec from pm_plans where task_id = new.task_id and plan_revision = v_plan;
    if v_plan is null or new.approved_revision <> v_plan then
      raise exception 'E must approve the latest plan revision';
    end if;
    if v_plan_spec <> v_spec or not exists (
      select 1 from approvals a where a.task_id = new.task_id and a.gate = 'A' and a.decision = 'approved' and a.approved_revision = v_spec
    ) then
      raise exception 'plan is stale: latest spec is not A-approved';
    end if;
    if new.work_item_id = '' or not exists (
      select 1 from agent_assignments s where s.task_id = new.task_id and s.plan_revision = v_plan and s.work_item_id = new.work_item_id
    ) then
      raise exception 'E must name a work item of the latest plan';
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
    -- PR의 CI 통과와 main 병합을 서버가 GitHub에서 확인한 최신 기록이 있어야 한다(v0.2 §8).
    if not exists (
      select 1 from (
        select c.ci_state, c.merged, c.pr_url from pr_checks c
        where c.task_id = new.task_id order by c.checked_at desc limit 1
      ) last
      join tasks t on t.id = new.task_id and t.pr_url = last.pr_url
      where last.ci_state = 'success' and last.merged
    ) then
      raise exception 'C requires a passing CI and merged PR checked by the server';
    end if;
  end if;
  return new;
end;
$$;


revoke all on function public.approvals_guard() from public, anon, authenticated;
