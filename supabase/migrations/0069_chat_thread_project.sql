-- v0.8.1 소유자 "프로젝트별 채팅창 > 대화" 구조: 챗봇 대화를 프로젝트에 묶을 수 있다(없으면 프로젝트 없는 채팅).
-- 프로젝트를 지우면 그 대화도 지운다. 본인 프로젝트에만 묶을 수 있다(RLS).
alter table public.chat_threads add column if not exists project_id uuid references public.projects (id) on delete cascade;
create index if not exists chat_threads_owner_project_idx on public.chat_threads (owner_id, project_id, updated_at desc);
drop policy if exists chat_threads_insert on public.chat_threads;
drop policy if exists chat_threads_update on public.chat_threads;
create policy chat_threads_insert on public.chat_threads for insert to authenticated
  with check (owner_id = (select auth.uid()) and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))));
create policy chat_threads_update on public.chat_threads for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))));
