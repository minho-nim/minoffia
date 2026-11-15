-- Gemini 시안(v0.7.13, 소유자 2026-11-12 "그리기는 둘이 그린 뒤 서로 평가, 내가 선택"):
-- 기획서 버전마다 Gemini A·B가 시안(SVG 와이어프레임·Mermaid 흐름·설명)을 하나씩 그리고 서로 평가한 것을 서버(draw-design)만 넣는다.
-- 소유자는 그중 하나를 고른다(design_picks, 추가만, 마지막 것이 고른 시안). 고르기는 승인 게이트가 아니다(승인은 기획·올리기·배포 3번 그대로).
create table if not exists public.design_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  spec_revision integer not null check (spec_revision > 0),
  who text not null check (who in ('A', 'B')),
  judge text not null default '',
  svg text not null check (char_length(svg) between 1 and 60000),
  flow text not null default '' check (char_length(flow) <= 3000),
  note text not null default '' check (char_length(note) <= 600),
  review jsonb,
  created_at timestamptz not null default now(),
  unique (task_id, spec_revision, who)
);
create trigger design_drafts_owner before insert on public.design_drafts for each row execute function public.owner_matches_task();
alter table public.design_drafts enable row level security;
create policy design_drafts_select on public.design_drafts for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.design_drafts from anon, authenticated;

create table if not exists public.design_picks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  spec_revision integer not null check (spec_revision > 0),
  draft_id uuid not null references public.design_drafts (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists design_picks_task_idx on public.design_picks (task_id, spec_revision, created_at);
create index if not exists design_picks_draft_idx on public.design_picks (draft_id);
create trigger design_picks_owner before insert on public.design_picks for each row execute function public.owner_matches_task();
alter table public.design_picks enable row level security;
create policy design_picks_select on public.design_picks for select to authenticated using (owner_id = (select auth.uid()));
-- 고르는 시안은 같은 업무·같은 기획서 버전의 내 시안이어야 한다
create policy design_picks_insert on public.design_picks for insert to authenticated with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.design_drafts d where d.id = draft_id and d.owner_id = (select auth.uid()) and d.task_id = design_picks.task_id and d.spec_revision = design_picks.spec_revision)
);
revoke update, delete on public.design_picks from anon, authenticated;
-- 새 표라 지우기(drop) 문은 넣지 않는다.

-- 그리기·평가 호출도 Gemini 사용 기록에 남긴다
alter table public.ai_calls drop constraint if exists ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('question', 'image', 'plan', 'prototype', 'research', 'review', 'pm', 'design', 'drawing'));

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['design_drafts', 'design_picks'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
