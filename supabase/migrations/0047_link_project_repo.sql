-- MinLab AI Office v0.6.18(소유자 2026-11-10 "전체적으로 복잡하네"): 이미 있던 저장소를 프로젝트에 연결해도
-- AI Office 작업 대상(managed_repos)에 넣는다. 전에는 '저장소 만들기' 버튼으로 만든 것만 들어가서
-- Codex·Claude 시작이 "허용된 저장소의 프로젝트만"으로 거절됐다(WorthIt).
-- minho-nim/MinLab은 계속 넣지 않는다. 하루 저장소 만들기 횟수는 앱이 만든 것(source='created')만 센다.

alter table public.managed_repos add column if not exists source text not null default 'created'
  check (source in ('created', 'linked'));

-- 오늘 손으로 넣은 WorthIt은 연결한 저장소다(만들기 횟수에 세지 않게)
update public.managed_repos m set source = 'linked'
where lower(m.full_name) = 'minho-nim/worthit' and m.source = 'created';

create or replace function public.link_project_repo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null or new.repo is null or new.repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' or lower(new.repo) = 'minho-nim/minlab' then
    return new;
  end if;
  insert into managed_repos (owner_id, project_id, full_name, html_url, source)
  values (new.owner_id, new.id, new.repo, 'https://github.com/' || new.repo, 'linked')
  on conflict (owner_id, full_name) do nothing;
  return new;
end;
$$;

revoke all on function public.link_project_repo() from public, anon, authenticated;

create trigger projects_link_repo
  after insert or update of repo on public.projects
  for each row execute function public.link_project_repo();

-- 이미 연결된 프로젝트도 넣는다
insert into public.managed_repos (owner_id, project_id, full_name, html_url, source)
select p.owner_id, p.id, p.repo, 'https://github.com/' || p.repo, 'linked'
from public.projects p
where p.owner_id is not null and p.repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and lower(p.repo) <> 'minho-nim/minlab'
on conflict (owner_id, full_name) do nothing;
