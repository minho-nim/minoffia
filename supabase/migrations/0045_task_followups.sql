-- v0.6.13 개발 중 추가 요청(소유자 "Claude·Codex는 개발 중에 연달아 보내도 알아서 답하는데"): 개발이 도는 동안 사장님이 더한 요청을
-- 모아 두고, 다음 PM 재계획(다시 개발)에 함께 보낸다. 내용은 추가만 하고, 보낸 시각(used_at)만 서버가 적는다.
create table if not exists public.task_followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 2000),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists task_followups_task_idx on public.task_followups (task_id, created_at);
create trigger task_followups_owner before insert on public.task_followups for each row execute function public.owner_matches_task();
alter table public.task_followups enable row level security;
create policy task_followups_select on public.task_followups for select to authenticated using (owner_id = (select auth.uid()));
create policy task_followups_insert on public.task_followups for insert to authenticated with check (owner_id = (select auth.uid()) and used_at is null);
-- 새 표라 지우기(drop) 문은 넣지 않는다(운영 적용 때 '지우기' 확인 창을 피함).
-- 수정·삭제 정책은 두지 않는다(로그인 사용자는 바꿀 수 없음). used_at은 서버(dispatch-claude)만 적는다.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_followups') then
    alter publication supabase_realtime add table public.task_followups;
  end if;
end $$;
