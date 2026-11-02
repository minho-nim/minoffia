-- MinLab AI Office v0.4.64(소유자 2026-11-02): 결과 점수 평가 기록. 결과 버전마다 한 번만(같은 결과를 두 번 채점하지 않음).
-- 서버(review-result, service role)만 넣는다. 소유자는 읽기만. 추가만 가능한 감사 기록이라 고치거나 지우지 않는다.
create table public.result_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  result_revision integer not null check (result_revision >= 1),
  work_item_id text not null default '',
  assignee text not null default '' check (char_length(assignee) <= 40),
  gates jsonb not null default '[]'::jsonb,
  score jsonb,
  total integer check (total is null or total between 0 and 100),
  verdict text not null check (verdict in ('pass', 'redo', 'owner')),
  reasons jsonb not null default '[]'::jsonb,
  feedback text not null default '' check (char_length(feedback) <= 4000),
  auto_redo integer not null default 0 check (auto_redo between 0 and 10),
  judge text not null default '' check (char_length(judge) <= 80),
  created_at timestamptz not null default now(),
  unique (task_id, result_revision)
);
create index result_reviews_owner_idx on public.result_reviews (owner_id, created_at);

alter table public.result_reviews enable row level security;
create policy result_reviews_select on public.result_reviews for select to authenticated using (owner_id = (select auth.uid()));

-- 평가 호출 횟수도 따로 센다(Gemini 무료 한도)
alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check check (purpose in ('question', 'image', 'plan', 'prototype', 'research', 'review'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'result_reviews') then
    alter publication supabase_realtime add table public.result_reviews;
  end if;
end $$;
