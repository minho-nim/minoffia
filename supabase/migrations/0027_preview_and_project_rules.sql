-- MinLab AI Office v0.4.57 (소유자 2026-11-01)
-- 1) 미리보기: Claude 보조 개발 세션이 시험 뒤 작업 브랜치를 미리보기용으로 push한다(PR·병합·배포는 여전히 올리기 승인 뒤).
--    프로젝트에 미리보기 주소(예: minlab-ai-office.pages.dev)가 있으면 서버가 브랜치 미리보기 링크를 계산해 결과에 붙인다.
-- 2) 프로젝트에서 지켜야 할 것: AI가 접수(기획서 초안)·계획·개발 결과에서 앞으로도 지켜야 할 것을 적어 두고,
--    다음 기획서·계획·개발 지시서에 함께 넣는다. 소유자는 지우기·직접 추가만 한다.

alter table public.projects
  add column if not exists preview_host text
  check (preview_host is null or (char_length(preview_host) <= 120 and preview_host ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'));

alter table public.dev_result_inbox
  add column if not exists preview_url text not null default '' check (char_length(preview_url) <= 300);

alter table public.result_packages
  add column if not exists preview_url text not null default '' check (preview_url = '' or (char_length(preview_url) <= 300 and preview_url ~ '^https://'));

create table public.project_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  rule text not null check (char_length(rule) between 2 and 200),
  -- spec = Gemini 기획서 초안, plan = Claude PM 계획, result = 개발 결과, owner = 소유자가 직접
  source text not null check (source in ('spec', 'plan', 'result', 'owner')),
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, rule)
);
create index project_rules_project_idx on public.project_rules (project_id, created_at);
create index project_rules_task_idx on public.project_rules (task_id);

alter table public.project_rules enable row level security;

create policy project_rules_select on public.project_rules for select to authenticated using (owner_id = (select auth.uid()));
create policy project_rules_insert on public.project_rules for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and source = 'owner'
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );
create policy project_rules_delete on public.project_rules for delete to authenticated using (owner_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_rules') then
    alter publication supabase_realtime add table public.project_rules;
  end if;
end $$;
