-- MinLab AI Office v0.2.6: AI Office가 만든 GitHub 저장소 기록
-- 서버(Edge Function create-repo)만 기록한다. Claude PM은 CLAUDE_ALLOWED_REPOSITORY와 여기 있는 저장소에서만 일한다.

create table public.managed_repos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- 프로젝트를 지워도 기록은 남긴다(GitHub 저장소는 남아 있으므로).
  project_id uuid references public.projects (id) on delete set null,
  full_name text not null check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  html_url text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, full_name)
);

create index managed_repos_owner_day_idx on public.managed_repos (owner_id, created_at);

alter table public.managed_repos enable row level security;

-- 읽기만(기록은 서버만).
create policy managed_repos_select on public.managed_repos for select to authenticated using (owner_id = (select auth.uid()));
