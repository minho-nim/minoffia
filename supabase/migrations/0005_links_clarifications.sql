-- MinLab AI Office v0.2.4: 링크 읽기 결과와 GPT 확인 질문·답변 기록
-- 링크는 서버(Edge Function fetch-link)만 읽고 기록한다. 내용은 신뢰할 수 없는 참고자료다.
-- 확인 질문·답변은 추가만 가능한 감사 기록이다.

-- 1. 링크 읽기 결과 -------------------------------------------------------------
create table public.link_refs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  url text not null check (char_length(url) between 8 and 2000),
  kind text not null check (kind in ('webpage', 'image', 'github', 'other')),
  status text not null check (status in ('ok', 'partial', 'failed', 'blocked')),
  http_status integer,
  content_type text not null default '' check (char_length(content_type) <= 200),
  title text not null default '' check (char_length(title) <= 300),
  excerpt text not null default '' check (char_length(excerpt) <= 20000),
  error text not null default '' check (char_length(error) <= 500),
  sha256 text not null default '',
  created_at timestamptz not null default now()
);

create index link_refs_task_idx on public.link_refs (task_id, created_at);
create index link_refs_owner_day_idx on public.link_refs (owner_id, created_at);

-- A 승인한 기획서가 본 자료는 바꾸지 못한다(첨부와 같은 규칙). 업무 삭제로 함께 지워질 때는 통과.
create or replace function public.link_refs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.link_refs;
  v_spec integer;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;
  if not exists (select 1 from tasks t where t.id = v_row.task_id and t.owner_id = v_row.owner_id) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'task does not belong to owner';
  end if;
  select max(revision) into v_spec from task_specs where task_id = v_row.task_id;
  if v_spec is not null and exists (
    select 1 from approvals a
    where a.task_id = v_row.task_id and a.gate = 'A' and a.decision = 'approved' and a.approved_revision = v_spec
  ) then
    raise exception 'request links are locked after A approval';
  end if;
  if tg_op = 'INSERT' and (select count(*) from link_refs where task_id = new.task_id) >= 20 then
    raise exception 'too many links';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger link_refs_guard before insert or delete on public.link_refs
for each row execute function public.link_refs_guard();

revoke all on function public.link_refs_guard() from public, anon, authenticated;

alter table public.link_refs enable row level security;

-- 읽기·삭제만. 기록은 서버(service_role)만 한다(가짜 읽기 결과를 만들 수 없게).
create policy link_refs_select on public.link_refs for select to authenticated using (owner_id = (select auth.uid()));
create policy link_refs_delete on public.link_refs for delete to authenticated using (owner_id = (select auth.uid()));

-- 2. GPT 확인 질문·답변 ------------------------------------------------------
create table public.clarifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  -- 기록할 때의 최신 기획서 버전(아직 없으면 0)
  spec_revision integer not null check (spec_revision >= 0),
  question text not null check (char_length(question) between 1 and 2000),
  answer text not null check (char_length(answer) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index clarifications_task_idx on public.clarifications (task_id, created_at);

create or replace function public.clarifications_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.owner_id = new.owner_id) then
    raise exception 'task does not belong to owner';
  end if;
  if new.spec_revision <> coalesce((select max(revision) from task_specs where task_id = new.task_id), 0) then
    raise exception 'clarification must target the latest spec revision';
  end if;
  if (select count(*) from clarifications where task_id = new.task_id) >= 30 then
    raise exception 'too many clarifications';
  end if;
  return new;
end;
$$;

create trigger clarifications_guard before insert on public.clarifications
for each row execute function public.clarifications_guard();

revoke all on function public.clarifications_guard() from public, anon, authenticated;

alter table public.clarifications enable row level security;

create policy clarifications_select on public.clarifications for select to authenticated using (owner_id = (select auth.uid()));
create policy clarifications_insert on public.clarifications for insert to authenticated with check (owner_id = (select auth.uid()));
