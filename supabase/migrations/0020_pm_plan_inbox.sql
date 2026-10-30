-- v0.4.2 PM 계획 자동 저장: Claude PM 세션이 계획을 다 쓰면 AI Office로 직접 보낸다(사용자는 붙여넣지 않는다).
-- 1) plan_submit_tokens: PM 전송(dispatch-claude) 때 만든 1회용 제출표(해시만 저장, 6시간, 3번까지). 서버만 읽고 쓴다.
-- 2) pm_plan_inbox: 세션이 보낸 계획 원문. 앱이 기존 계획 검증(parsePmPlan)을 거쳐 pm_plans·배정으로 옮긴다.
--    제출표는 이 업무의 계획 제출에만 쓸 수 있고, 들어온 계획도 E 승인 전에는 아무것도 실행하지 않는다.

create table public.plan_submit_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  spec_revision integer not null check (spec_revision >= 1),
  token_hash text not null unique check (char_length(token_hash) = 64),
  uses integer not null default 0 check (uses between 0 and 3),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index plan_submit_tokens_task_idx on public.plan_submit_tokens (task_id);
alter table public.plan_submit_tokens enable row level security;
-- 정책 없음: 사용자·익명은 읽지도 쓰지도 못한다(service_role만).

create table public.pm_plan_inbox (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  spec_revision integer not null check (spec_revision >= 1),
  plan_text text not null check (char_length(plan_text) between 2 and 65000),
  status text not null default 'new' check (status in ('new', 'imported', 'invalid')),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index pm_plan_inbox_owner_status_idx on public.pm_plan_inbox (owner_id, status);
alter table public.pm_plan_inbox enable row level security;
create policy pm_plan_inbox_select on public.pm_plan_inbox for select to authenticated using (owner_id = (select auth.uid()));
create policy pm_plan_inbox_update on public.pm_plan_inbox for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- 사용자는 상태(new → imported/invalid)와 메모만 바꿀 수 있다. 계획 원문·업무·버전은 고칠 수 없다.
create or replace function public.pm_plan_inbox_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan_text is distinct from old.plan_text or new.task_id is distinct from old.task_id
     or new.spec_revision is distinct from old.spec_revision or new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at then
    raise exception 'pm_plan_inbox: only status and note can change';
  end if;
  if old.status <> 'new' then
    raise exception 'pm_plan_inbox: already handled';
  end if;
  return new;
end;
$$;
revoke execute on function public.pm_plan_inbox_guard() from public, anon, authenticated;
create trigger pm_plan_inbox_guard before update on public.pm_plan_inbox
  for each row execute function public.pm_plan_inbox_guard();

-- 자동으로 들어온 계획의 출처
alter table public.pm_plans drop constraint if exists pm_plans_source_check;
alter table public.pm_plans add constraint pm_plans_source_check check (source in ('routine_session_manual_import', 'routine_session_auto', 'manual'));

-- 여러 기기 실시간 반영(0015와 같은 방식)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pm_plan_inbox') then
    alter publication supabase_realtime add table public.pm_plan_inbox;
  end if;
end $$;
