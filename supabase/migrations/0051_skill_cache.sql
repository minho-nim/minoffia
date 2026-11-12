-- MinLab AI Office v0.6.70(소유자 2026-11-12 "스킬 목록을 휴대폰 말고 서버에 올리면 안 돼?"):
-- 스킬 모음 목록과 프로젝트별 스킬 상태를 계정당 한 행으로 저장해 두고, 앱을 켤 때 GitHub 대신 이 행을 바로 읽는다.
-- 서버 함수 repo-tree가 GitHub에서 새로 읽을 때마다 소유자 권한(RLS)으로 덮어쓴다. 저장소 파일 내용의 사본일 뿐 비밀값은 없다.
create table if not exists public.skill_cache (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  files jsonb check (files is null or (jsonb_typeof(files) = 'array' and octet_length(files::text) <= 3000000)),
  map jsonb check (map is null or (jsonb_typeof(map) = 'object' and octet_length(map::text) <= 200000)),
  updated_at timestamptz not null default now()
);

alter table public.skill_cache enable row level security;

create policy skill_cache_select on public.skill_cache for select to authenticated using (owner_id = (select auth.uid()));
create policy skill_cache_insert on public.skill_cache for insert to authenticated with check (owner_id = (select auth.uid()));
create policy skill_cache_update on public.skill_cache for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.skill_cache from anon;
