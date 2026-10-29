-- MinLab AI Office v0.2.1: 확정 업무 플로우와 4개 승인 이벤트(A/E/B/C)
-- A = 개발 방향(기획서) 승인, E = AI 실행 승인, B = GitHub 업로드 승인, C = 운영 배포 승인
-- 기존 tasks 행은 지우지 않고 새 열로 확장한다. 승인·기획서·결과는 추가만 가능(감사 기록).

-- 1. tasks 확장 ------------------------------------------------------------
alter table public.tasks
  add column if not exists stage text not null default 'received',
  add column if not exists user_original_text text,
  add column if not exists dispatch_spec_revision integer,
  add column if not exists pr_url text;

alter table public.tasks drop constraint if exists tasks_stage_check;
alter table public.tasks add constraint tasks_stage_check check (stage in (
  'received', 'media_analysis', 'planner_handoff', 'planning', 'needs_clarification', 'spec_ready',
  'development_approval_pending', 'pm_queued', 'dispatching', 'agent_handoff_pending', 'executing',
  'validation', 'result_review', 'github_approval_pending', 'github_uploading', 'pr_review',
  'deployment_approval_pending', 'deploying', 'completed', 'paused', 'rate_limited',
  'integration_blocked', 'failed', 'cancelled'
));

-- 기존 v0.1 업무: 원문 보존, 완료는 completed, 나머지는 새 플로우의 첫 단계로.
update public.tasks
set user_original_text = coalesce(user_original_text, title || case when description <> '' then E'\n\n' || description else '' end),
    stage = case when status = 'done' then 'completed' else 'received' end
where user_original_text is null;

-- 기존 tasks_guard에 새 열 보호 추가: 클라이언트는 PM 전송 기록(dispatch_spec_revision)을 바꾸지 못한다.
create or replace function public.tasks_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
begin
  if not exists (select 1 from projects p where p.id = new.project_id and p.owner_id = new.owner_id) then
    raise exception 'project does not belong to task owner';
  end if;
  if not v_is_service then
    if tg_op = 'INSERT' then
      new.dispatch_state := 'none';
      new.dispatch_session_url := null;
      new.dispatch_error := null;
      new.dispatch_at := null;
      new.dispatch_spec_revision := null;
    else
      new.dispatch_state := old.dispatch_state;
      new.dispatch_session_url := old.dispatch_session_url;
      new.dispatch_error := old.dispatch_error;
      new.dispatch_at := old.dispatch_at;
      new.dispatch_spec_revision := old.dispatch_spec_revision;
      new.owner_id := old.owner_id;
      if old.dispatch_state = 'dispatching' and new.status <> old.status then
        raise exception 'task is being dispatched';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.tasks_guard() from public, anon, authenticated;

-- 2. 기획서(지시서) 버전 -----------------------------------------------------
create table public.task_specs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  revision integer not null check (revision >= 1),
  intent text not null check (intent in ('question', 'change_request', 'asset_request', 'ambiguous')),
  planner text not null default 'chatgpt_manual' check (planner in ('chatgpt_manual')),
  user_original_text text not null,
  final_prompt text not null default '' check (char_length(final_prompt) <= 20000),
  change_scope text not null default '' check (char_length(change_scope) <= 4000),
  preserve_constraints text not null default '' check (char_length(preserve_constraints) <= 4000),
  test_criteria text not null default '' check (char_length(test_criteria) <= 4000),
  answer text not null default '' check (char_length(answer) <= 20000),
  created_at timestamptz not null default now(),
  unique (task_id, revision)
);

-- 3. 승인 이벤트 -------------------------------------------------------------
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  gate text not null check (gate in ('A', 'E', 'B', 'C')),
  decision text not null check (decision in ('approved', 'rejected')),
  approved_revision integer not null check (approved_revision >= 1),
  previous_revision integer,
  work_item_id text not null default '',
  scope jsonb not null default '{}'::jsonb,
  actor text not null default '',
  created_at timestamptz not null default now()
);

-- 같은 버전·작업에 대한 승인은 한 번만(모바일 중복 클릭 방지).
create unique index approvals_once on public.approvals (task_id, gate, approved_revision, work_item_id)
  where decision = 'approved';

-- 4. Claude PM 계획 ----------------------------------------------------------
create table public.pm_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  plan_revision integer not null check (plan_revision >= 1),
  approved_spec_revision integer not null,
  target_base_revision text not null default '',
  source text not null check (source in ('routine_session_manual_import', 'manual')),
  plan jsonb not null,
  created_at timestamptz not null default now(),
  unique (task_id, plan_revision)
);

-- 5. AI 배정 ---------------------------------------------------------------
create table public.agent_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  plan_revision integer not null,
  work_item_id text not null,
  title text not null default '',
  assignee text not null check (assignee in ('codex', 'claude', 'gemini', 'grok')),
  execution_mode text not null check (execution_mode in ('codex_cloud', 'manual_handoff')),
  dispatch_status text not null default 'proposed' check (dispatch_status in (
    'proposed', 'awaiting_user_execution_approval', 'ready', 'starting', 'started',
    'blocked_integration', 'blocked_quota', 'failed', 'completed'
  )),
  -- 상태를 누가 알려줬는지: 서버가 공급자에게 확인 / 사용자가 직접 기록
  status_source text not null default 'none' check (status_source in ('none', 'server_verified', 'user_reported')),
  provider_execution_id text,
  provider_task_url text,
  actual_provider_status text not null default 'unknown',
  started_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (task_id, plan_revision, work_item_id)
);

-- 6. 결과 패키지(GitHub 업로드 전 검토용) ------------------------------------
create table public.result_packages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  revision integer not null check (revision >= 1),
  plan_revision integer,
  work_item_id text not null default '',
  source text not null check (source in ('codex_cloud_manual', 'claude_manual', 'manual')),
  summary text not null default '' check (char_length(summary) <= 4000),
  diff text not null default '' check (char_length(diff) <= 500000),
  test_log text not null default '' check (char_length(test_log) <= 100000),
  remaining_issues text not null default '' check (char_length(remaining_issues) <= 4000),
  sha256 text not null default '',
  created_at timestamptz not null default now(),
  unique (task_id, revision)
);

-- 6-1. 결과 검토 → Claude PM 수정 요청 --------------------------------------
-- 같은 기획서 버전으로 PM에 다시 보내 새 계획을 받는다. 수정 요청이 있을 때만 재전송할 수 있다.
create table public.revision_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  spec_revision integer not null,
  result_revision integer not null,
  feedback text not null check (char_length(feedback) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index revision_requests_task_idx on public.revision_requests (task_id, created_at desc);

-- 7. 소유자 일치 + 승인 게이트(서버 재검증) ----------------------------------
create or replace function public.owner_matches_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.owner_id = new.owner_id) then
    raise exception 'task does not belong to owner';
  end if;
  return new;
end;
$$;

create trigger task_specs_owner before insert on public.task_specs for each row execute function public.owner_matches_task();
create trigger pm_plans_owner before insert on public.pm_plans for each row execute function public.owner_matches_task();
create trigger agent_assignments_owner before insert on public.agent_assignments for each row execute function public.owner_matches_task();
create trigger result_packages_owner before insert on public.result_packages for each row execute function public.owner_matches_task();

-- 기획서 버전은 1부터 빈틈없이 증가해야 한다.
create or replace function public.task_specs_next_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
begin
  select coalesce(max(revision), 0) into v_max from task_specs where task_id = new.task_id;
  if new.revision <> v_max + 1 then
    raise exception 'spec revision must be %', v_max + 1;
  end if;
  return new;
end;
$$;

create trigger task_specs_revision before insert on public.task_specs for each row execute function public.task_specs_next_revision();

-- PM 계획은 승인(A)된 최신 기획서에 대해서만 저장할 수 있다.
create or replace function public.pm_plans_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest integer;
  v_max integer;
begin
  select max(revision) into v_latest from task_specs where task_id = new.task_id;
  if v_latest is null or new.approved_spec_revision <> v_latest then
    raise exception 'plan must target the latest spec revision';
  end if;
  if not exists (
    select 1 from approvals a
    where a.task_id = new.task_id and a.gate = 'A' and a.decision = 'approved' and a.approved_revision = v_latest
  ) then
    raise exception 'A approval required before PM plan';
  end if;
  select coalesce(max(plan_revision), 0) into v_max from pm_plans where task_id = new.task_id;
  if new.plan_revision <> v_max + 1 then
    raise exception 'plan revision must be %', v_max + 1;
  end if;
  return new;
end;
$$;

create trigger pm_plans_guard before insert on public.pm_plans for each row execute function public.pm_plans_guard();

create or replace function public.result_packages_next_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
begin
  select coalesce(max(revision), 0) into v_max from result_packages where task_id = new.task_id;
  if new.revision <> v_max + 1 then
    raise exception 'result revision must be %', v_max + 1;
  end if;
  return new;
end;
$$;

create trigger result_packages_revision before insert on public.result_packages for each row execute function public.result_packages_next_revision();

-- 수정 요청은 A 승인된 최신 기획서와, 아직 B 승인하지 않은 최신 결과에만 할 수 있다.
create or replace function public.revision_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec integer;
  v_result integer;
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.owner_id = new.owner_id) then
    raise exception 'task does not belong to owner';
  end if;
  select max(revision) into v_spec from task_specs where task_id = new.task_id;
  if v_spec is null or new.spec_revision <> v_spec or not exists (
    select 1 from approvals a where a.task_id = new.task_id and a.gate = 'A' and a.decision = 'approved' and a.approved_revision = v_spec
  ) then
    raise exception 'revision request needs the latest A-approved spec';
  end if;
  select max(revision) into v_result from result_packages where task_id = new.task_id;
  if v_result is null or new.result_revision <> v_result then
    raise exception 'revision request must target the latest result package';
  end if;
  if exists (
    select 1 from approvals a where a.task_id = new.task_id and a.gate = 'B' and a.decision = 'approved' and a.approved_revision = v_result
  ) then
    raise exception 'result already approved for GitHub upload';
  end if;
  return new;
end;
$$;

create trigger revision_requests_guard before insert on public.revision_requests for each row execute function public.revision_requests_guard();

-- 승인 게이트. UI가 아니라 DB가 마지막으로 확인한다.
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
  end if;
  return new;
end;
$$;

create trigger approvals_guard before insert on public.approvals for each row execute function public.approvals_guard();

-- 배정 상태: 사용자는 수동 인계 기록만 할 수 있고, 실행 시작은 E 승인 뒤에만 기록된다.
create or replace function public.agent_assignments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
begin
  if tg_op = 'UPDATE' then
    new.task_id := old.task_id;
    new.owner_id := old.owner_id;
    new.plan_revision := old.plan_revision;
    new.work_item_id := old.work_item_id;
    new.assignee := old.assignee;
    new.execution_mode := old.execution_mode;
  end if;
  if not v_is_service then
    -- 서버가 확인한 상태처럼 꾸밀 수 없다.
    if new.status_source = 'server_verified' or new.last_verified_at is distinct from (case when tg_op = 'UPDATE' then old.last_verified_at else null end) then
      raise exception 'only the server can record verified provider status';
    end if;
    if new.dispatch_status in ('starting', 'started', 'completed') and not exists (
      select 1 from approvals a
      where a.task_id = new.task_id and a.gate = 'E' and a.decision = 'approved'
        and a.approved_revision = new.plan_revision and a.work_item_id = new.work_item_id
    ) then
      raise exception 'E approval required before recording execution';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger agent_assignments_guard before insert or update on public.agent_assignments
for each row execute function public.agent_assignments_guard();

-- 트리거 함수는 API로 직접 호출하지 못하게 한다.
revoke all on function public.owner_matches_task() from public, anon, authenticated;
revoke all on function public.task_specs_next_revision() from public, anon, authenticated;
revoke all on function public.pm_plans_guard() from public, anon, authenticated;
revoke all on function public.result_packages_next_revision() from public, anon, authenticated;
revoke all on function public.approvals_guard() from public, anon, authenticated;
revoke all on function public.agent_assignments_guard() from public, anon, authenticated;
revoke all on function public.revision_requests_guard() from public, anon, authenticated;

-- 8. RLS --------------------------------------------------------------------
alter table public.task_specs enable row level security;
alter table public.approvals enable row level security;
alter table public.pm_plans enable row level security;
alter table public.agent_assignments enable row level security;
alter table public.result_packages enable row level security;
alter table public.revision_requests enable row level security;

-- 기획서·승인·계획·결과: 읽기와 추가만(수정·삭제 불가 = 감사 기록 보존). 업무를 지우면 함께 지워진다.
create policy task_specs_select on public.task_specs for select to authenticated using (owner_id = auth.uid());
create policy task_specs_insert on public.task_specs for insert to authenticated with check (owner_id = auth.uid());
create policy approvals_select on public.approvals for select to authenticated using (owner_id = auth.uid());
create policy approvals_insert on public.approvals for insert to authenticated with check (owner_id = auth.uid());
create policy pm_plans_select on public.pm_plans for select to authenticated using (owner_id = auth.uid());
create policy pm_plans_insert on public.pm_plans for insert to authenticated with check (owner_id = auth.uid());
create policy result_packages_select on public.result_packages for select to authenticated using (owner_id = auth.uid());
create policy result_packages_insert on public.result_packages for insert to authenticated with check (owner_id = auth.uid());
create policy revision_requests_select on public.revision_requests for select to authenticated using (owner_id = auth.uid());
create policy revision_requests_insert on public.revision_requests for insert to authenticated with check (owner_id = auth.uid());
create policy agent_assignments_select on public.agent_assignments for select to authenticated using (owner_id = auth.uid());
create policy agent_assignments_insert on public.agent_assignments for insert to authenticated with check (owner_id = auth.uid());
create policy agent_assignments_update on public.agent_assignments for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 9. Claude PM 전송 예약: A 승인된 기획서 버전마다 한 번 -----------------------
drop function if exists public.claim_claude_dispatch(uuid, uuid, boolean, integer);

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
    and assignee = 'claude'
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
