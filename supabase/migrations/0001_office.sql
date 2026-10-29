-- MinLab AI Office v0.1
-- 모든 행은 소유자(auth.uid())만 보고 바꿀 수 있다.
-- Claude Cloud 실행 상태(dispatch_*)와 cloud 실행 기록은 서버(service_role)만 쓴다.

create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  repo text check (repo is null or repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  type text not null check (type in ('planning', 'dev', 'design', 'prototype', 'research', 'qa')),
  requested_type text not null default 'auto'
    check (requested_type in ('auto', 'planning', 'dev', 'design', 'prototype', 'research', 'qa')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assignee text not null check (assignee in ('mina', 'claude', 'codex', 'grok', 'studioA', 'studioB', 'ci')),
  route_reason text not null default '',
  status text not null default 'queued' check (status in ('queued', 'in_progress', 'review', 'blocked', 'done')),
  dispatch_state text not null default 'none' check (dispatch_state in ('none', 'dispatching', 'dispatched', 'failed')),
  dispatch_session_url text,
  dispatch_error text,
  dispatch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_owner_idx on public.tasks (owner_id, created_at desc);

create table public.usage_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent text not null check (agent in ('mina', 'claude', 'codex', 'grok', 'studioA', 'studioB', 'ci')),
  task_id uuid references public.tasks (id) on delete set null,
  kind text not null check (kind in ('cloud', 'manual')),
  day date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now()
);

create index usage_runs_owner_day_idx on public.usage_runs (owner_id, agent, day);

-- 프로젝트와 업무의 소유자가 같아야 한다.
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
    -- 클라이언트는 Claude 실행 상태를 바꾸지 못한다.
    if tg_op = 'INSERT' then
      new.dispatch_state := 'none';
      new.dispatch_session_url := null;
      new.dispatch_error := null;
      new.dispatch_at := null;
    else
      new.dispatch_state := old.dispatch_state;
      new.dispatch_session_url := old.dispatch_session_url;
      new.dispatch_error := old.dispatch_error;
      new.dispatch_at := old.dispatch_at;
      new.owner_id := old.owner_id;
      -- 전송 중에는 사람이 상태를 바꾸지 못한다.
      if old.dispatch_state = 'dispatching' and new.status <> old.status then
        raise exception 'task is being dispatched';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_guard
before insert or update on public.tasks
for each row execute function public.tasks_guard();

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.usage_runs enable row level security;

create policy projects_owner on public.projects
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy tasks_owner on public.tasks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy usage_select on public.usage_runs
  for select to authenticated
  using (owner_id = auth.uid());

-- 클라이언트는 수동 실행만 기록할 수 있다. cloud 기록은 claim 함수가 남긴다.
create policy usage_insert_manual on public.usage_runs
  for insert to authenticated
  with check (owner_id = auth.uid() and kind = 'manual');

-- Claude Cloud 실행을 원자적으로 예약한다.
-- 같은 소유자의 동시 요청은 advisory lock으로 줄을 세우고, 한도 확인·상태 전환·실행 기록을 한 트랜잭션에서 한다.
-- 실패해도 기록은 남겨 둔다(원격에서 실제로 실행됐을 수 있으므로 보수적으로 센다).
create or replace function public.claim_claude_dispatch(
  p_task uuid,
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
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('claude-dispatch:' || p_owner::text));

  select count(*) into v_count
  from usage_runs
  where owner_id = p_owner
    and agent = 'claude'
    and kind = 'cloud'
    and day = (now() at time zone 'Asia/Seoul')::date;

  if v_count >= p_cap then
    return query select false, 'daily_cap';
    return;
  end if;

  update tasks
  set dispatch_state = 'dispatching',
      dispatch_error = null,
      dispatch_at = now()
  where id = p_task
    and owner_id = p_owner
    and assignee = 'claude'
    and status <> 'done'
    and (dispatch_state = 'none' or (dispatch_state = 'failed' and p_allow_retry));

  if not found then
    return query select false, 'not_claimable';
    return;
  end if;

  insert into usage_runs (owner_id, agent, task_id, kind) values (p_owner, 'claude', p_task, 'cloud');
  return query select true, 'claimed';
end;
$$;

revoke all on function public.claim_claude_dispatch(uuid, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.claim_claude_dispatch(uuid, uuid, boolean, integer) to service_role;
