-- MinLab AI Office v0.3.0: 여러 기기에서 같은 입력창을 보고, 대화·개발 내역을 프로젝트별·날짜별 개발일지로 모은다.
-- 소유자 결정(2026-10-30): 대화는 계정에 저장해 기기를 옮겨도 이어 보고, 개발일지를 위해 지우지 않고 모아 둔다.
--   (이전 결정 '일반 질문 글은 저장하지 않는다'를 바꾼다. Gemini에 보낸 질문·답변도 대화 기록에 남는다.)

-- 1) 입력창 화면 상태(계정당 한 행): 지금 보이는 최근 대화와 미나가 기다리는 선택. '대화 지우기'는 이 화면만 비운다.
create table public.inbox_state (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 60 and octet_length(messages::text) <= 400000),
  pending jsonb check (pending is null or (jsonb_typeof(pending) = 'object' and octet_length(pending::text) <= 20000)),
  updated_at timestamptz not null default now()
);

alter table public.inbox_state enable row level security;

create policy inbox_state_select on public.inbox_state for select to authenticated using (owner_id = (select auth.uid()));
create policy inbox_state_insert on public.inbox_state for insert to authenticated with check (owner_id = (select auth.uid()));
create policy inbox_state_update on public.inbox_state for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy inbox_state_delete on public.inbox_state for delete to authenticated using (owner_id = (select auth.uid()));

-- 2) 대화 기록(개발일지 원본). 추가만 가능하고 고치거나 지울 수 없다(계정을 지우면 함께 지워진다).
--    업무 접수 안내처럼 프로젝트·업무가 정해진 메시지는 그 프로젝트·업무에 연결한다. 프로젝트·업무를 지워도 기록은 남는다.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  role text not null check (role in ('me', 'office', 'gemini')),
  text text not null check (char_length(text) between 1 and 20000),
  created_at timestamptz not null default now()
);

create index chat_messages_owner_time_idx on public.chat_messages (owner_id, created_at);

alter table public.chat_messages enable row level security;

create policy chat_messages_select on public.chat_messages for select to authenticated using (owner_id = (select auth.uid()));
create policy chat_messages_insert on public.chat_messages for insert to authenticated with check (owner_id = (select auth.uid()));

create or replace function public.chat_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null and not exists (select 1 from projects p where p.id = new.project_id and p.owner_id = new.owner_id) then
    raise exception 'project does not belong to owner';
  end if;
  if new.task_id is not null and not exists (select 1 from tasks t where t.id = new.task_id and t.owner_id = new.owner_id) then
    raise exception 'task does not belong to owner';
  end if;
  new.created_at := now();
  return new;
end $$;

revoke execute on function public.chat_messages_guard() from public, anon, authenticated;

create trigger chat_messages_guard before insert on public.chat_messages
  for each row execute function public.chat_messages_guard();

-- 3) 운영 배포 기록(서버 Edge Function deploy-release만 기록, 사용자는 읽기만·고칠 수 없음. 업무를 지우면 함께 지워진다).
--    release 브랜치를 main으로 앞당긴(fast-forward) 기록이다. Cloudflare 빌드 완료는 따로 확인해야 한다.
create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  branch text not null default 'release' check (branch = 'release'),
  from_sha text not null default '',
  to_sha text not null default '',
  ok boolean not null,
  error text not null default '' check (char_length(error) <= 500),
  created_at timestamptz not null default now()
);

create index deployments_task_idx on public.deployments (task_id, created_at desc);

alter table public.deployments enable row level security;

create policy deployments_select on public.deployments for select to authenticated using (owner_id = (select auth.uid()));

-- 성공 기록은 C 승인이 있어야만 남는다(서버 코드가 틀려도 DB가 막는다).
create or replace function public.deployments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.owner_id = new.owner_id) then
    raise exception 'task does not belong to owner';
  end if;
  if new.ok and not exists (
    select 1 from approvals a where a.task_id = new.task_id and a.gate = 'C' and a.decision = 'approved'
  ) then
    raise exception 'deployment requires C approval';
  end if;
  return new;
end $$;

revoke execute on function public.deployments_guard() from public, anon, authenticated;

create trigger deployments_guard before insert on public.deployments
  for each row execute function public.deployments_guard();
