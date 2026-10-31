-- v0.4.3 Claude 보조 개발 결과 자동 저장: Claude 세션이 개발·시험을 끝내면 결과를 AI Office로 직접 보낸다.
-- 1) plan_submit_tokens를 결과 제출에도 쓴다(kind 'result', 작업 하나 전용). 해시만 저장, 서버만 읽고 쓴다.
-- 2) dev_result_inbox: 세션이 보낸 결과 원문. 앱이 작업·계획 버전을 확인한 뒤 결과 패키지로 옮긴다.
--    결과는 GitHub에 올라가지 않는다(올리기 승인 B 전 push·PR 금지는 그대로).

alter table public.plan_submit_tokens add column if not exists kind text not null default 'plan';
alter table public.plan_submit_tokens drop constraint if exists plan_submit_tokens_kind_check;
alter table public.plan_submit_tokens add constraint plan_submit_tokens_kind_check check (kind in ('plan', 'result'));
alter table public.plan_submit_tokens add column if not exists assignment_id uuid references public.agent_assignments (id) on delete cascade;
alter table public.plan_submit_tokens drop constraint if exists plan_submit_tokens_result_needs_assignment;
alter table public.plan_submit_tokens add constraint plan_submit_tokens_result_needs_assignment check (kind = 'plan' or assignment_id is not null);

create table public.dev_result_inbox (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  assignment_id uuid not null references public.agent_assignments (id) on delete cascade,
  summary text not null default '' check (char_length(summary) <= 4000),
  changed_files text not null default '' check (char_length(changed_files) <= 20000),
  diff text not null default '' check (char_length(diff) <= 500000),
  test_log text not null default '' check (char_length(test_log) <= 100000),
  remaining_issues text not null default '' check (char_length(remaining_issues) <= 4000),
  branch text not null default '' check (char_length(branch) <= 200),
  status text not null default 'new' check (status in ('new', 'imported', 'invalid')),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index dev_result_inbox_owner_status_idx on public.dev_result_inbox (owner_id, status);
alter table public.dev_result_inbox enable row level security;
create policy dev_result_inbox_select on public.dev_result_inbox for select to authenticated using (owner_id = (select auth.uid()));
create policy dev_result_inbox_update on public.dev_result_inbox for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- 사용자는 상태(new → imported/invalid)와 메모만 한 번 바꿀 수 있다. 결과 원문은 고칠 수 없다.
create or replace function public.dev_result_inbox_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.summary, new.changed_files, new.diff, new.test_log, new.remaining_issues, new.branch, new.task_id, new.assignment_id, new.owner_id, new.created_at)
     is distinct from (old.summary, old.changed_files, old.diff, old.test_log, old.remaining_issues, old.branch, old.task_id, old.assignment_id, old.owner_id, old.created_at) then
    raise exception 'dev_result_inbox: only status and note can change';
  end if;
  if old.status <> 'new' then
    raise exception 'dev_result_inbox: already handled';
  end if;
  return new;
end;
$$;
revoke execute on function public.dev_result_inbox_guard() from public, anon, authenticated;
create trigger dev_result_inbox_guard before update on public.dev_result_inbox
  for each row execute function public.dev_result_inbox_guard();

-- 세션이 직접 보낸 결과의 출처
alter table public.result_packages drop constraint if exists result_packages_source_check;
alter table public.result_packages add constraint result_packages_source_check
  check (source in ('codex_cloud_manual', 'claude_manual', 'claude_session_auto', 'manual'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dev_result_inbox') then
    alter publication supabase_realtime add table public.dev_result_inbox;
  end if;
end $$;
