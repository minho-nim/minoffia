-- MinLab AI Office v0.2.9: 요청 자료 이미지의 Gemini 분석(v0.2 §4)
-- 사용자가 버튼을 눌렀을 때만 서버(Edge Function analyze-image)가 분석하고 기록한다.
-- 분석은 원본을 대신하지 않는다. 보이는 것(관찰)과 추정을 나눠 JSON으로 남긴다.

-- 1. Gemini 사용 기록을 용도별로 센다(일반 질문 / 이미지 분석)
alter table public.ai_calls
  add column if not exists purpose text not null default 'question' check (purpose in ('question', 'image'));

-- 2. 이미지 분석 결과(첨부 하나에 하나)
create table public.image_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  attachment_id uuid not null unique references public.attachments (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  model text not null default '' check (char_length(model) <= 100),
  -- 1 = GEMINI_API_KEY(A), 2 = GEMINI_API_KEY2(B 예비), null = 같은 이미지의 이전 분석을 다시 씀
  key_slot smallint check (key_slot in (1, 2)),
  analysis jsonb not null check (octet_length(analysis::text) <= 30000),
  created_at timestamptz not null default now()
);

create index image_analyses_owner_sha_idx on public.image_analyses (owner_id, sha256);

-- 요청 자료와 같은 규칙: A 승인 뒤에는 새 분석을 붙이지 않는다(승인한 기획서가 본 자료를 바꾸지 않게).
create or replace function public.image_analyses_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec integer;
begin
  if not exists (
    select 1 from attachments a
    where a.id = new.attachment_id and a.task_id = new.task_id and a.owner_id = new.owner_id and a.kind = 'request'
  ) then
    raise exception 'analysis must target a request attachment of the owner';
  end if;
  select max(revision) into v_spec from task_specs where task_id = new.task_id;
  if v_spec is not null and exists (
    select 1 from approvals ap
    where ap.task_id = new.task_id and ap.gate = 'A' and ap.decision = 'approved' and ap.approved_revision = v_spec
  ) then
    raise exception 'request attachments are locked after A approval';
  end if;
  return new;
end;
$$;

create trigger image_analyses_guard before insert on public.image_analyses
for each row execute function public.image_analyses_guard();

revoke all on function public.image_analyses_guard() from public, anon, authenticated;

alter table public.image_analyses enable row level security;

-- 읽기만(기록은 서버만, 고치거나 지울 수 없음. 첨부를 지우면 함께 지워진다).
create policy image_analyses_select on public.image_analyses for select to authenticated using (owner_id = (select auth.uid()));
