-- MinLab AI Office v0.2.3: 이미지 첨부(요청 자료 · 결과 스크린샷)
-- 원본은 비공개 Storage 버킷 `attachments`에 `<owner>/<task>/<sha256>.<ext>`로 둔다. 화면은 만료 주소로만 읽는다.
-- 요청 자료는 A 승인 전까지만 바꿀 수 있고, 결과 스크린샷은 추가만 가능한 감사 기록이다.
-- 규칙은 src/domain/attachments.ts 와 같아야 한다.

-- 1. 첨부 기록 ---------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  kind text not null check (kind in ('request', 'result')),
  result_revision integer,
  position integer not null default 0 check (position between 0 and 99),
  role text not null check (role in ('current', 'target', 'error', 'reference', 'before', 'after')),
  note text not null default '' check (char_length(note) <= 500),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null check (char_length(storage_path) <= 300),
  created_at timestamptz not null default now(),
  check ((kind = 'request') = (result_revision is null)),
  check (
    (kind = 'request' and role in ('current', 'target', 'error', 'reference'))
    or (kind = 'result' and role in ('before', 'after'))
  )
);

create index attachments_task_idx on public.attachments (task_id, kind, result_revision, position);
create index attachments_path_idx on public.attachments (storage_path);

create or replace function public.attachments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attachments;
  v_spec integer;
  v_result integer;
  v_count integer;
  v_total bigint;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if not exists (select 1 from tasks t where t.id = v_row.task_id and t.owner_id = v_row.owner_id) then
    -- 업무를 지울 때 함께 지워지는 경우(on delete cascade)는 업무가 이미 없다.
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'task does not belong to owner';
  end if;

  if tg_op = 'UPDATE' then
    -- 바꿀 수 있는 것은 순서·역할·설명뿐이다.
    new.task_id := old.task_id;
    new.owner_id := old.owner_id;
    new.kind := old.kind;
    new.result_revision := old.result_revision;
    new.file_name := old.file_name;
    new.mime := old.mime;
    new.size_bytes := old.size_bytes;
    new.sha256 := old.sha256;
    new.storage_path := old.storage_path;
    new.created_at := old.created_at;
  end if;

  if v_row.kind = 'request' then
    -- A 승인한 기획서가 본 자료를 나중에 바꾸지 못한다. 바꾸려면 기획서를 새 버전으로 저장(A 무효)한다.
    select max(revision) into v_spec from task_specs where task_id = v_row.task_id;
    if v_spec is not null and exists (
      select 1 from approvals a
      where a.task_id = v_row.task_id and a.gate = 'A' and a.decision = 'approved' and a.approved_revision = v_spec
    ) then
      raise exception 'request attachments are locked after A approval';
    end if;
  else
    if tg_op <> 'INSERT' then
      raise exception 'result attachments are append-only';
    end if;
    select max(revision) into v_result from result_packages where task_id = new.task_id;
    if v_result is null or new.result_revision is distinct from v_result then
      raise exception 'result attachment must target the latest result package';
    end if;
    if exists (
      select 1 from approvals a
      where a.task_id = new.task_id and a.gate = 'B' and a.decision = 'approved' and a.approved_revision = v_result
    ) then
      raise exception 'result already approved for GitHub upload';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.storage_path not like new.owner_id::text || '/' || new.task_id::text || '/%' then
      raise exception 'invalid storage path';
    end if;
    select count(*) into v_count from attachments
    where task_id = new.task_id and kind = new.kind and result_revision is not distinct from new.result_revision;
    if v_count >= (case when new.kind = 'request' then 10 else 6 end) then
      raise exception 'too many attachments';
    end if;
    select coalesce(sum(size_bytes), 0) into v_total from attachments where owner_id = new.owner_id;
    if v_total + new.size_bytes > 900 * 1024 * 1024 then
      raise exception 'attachment storage quota exceeded';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger attachments_guard before insert or update or delete on public.attachments
for each row execute function public.attachments_guard();

revoke all on function public.attachments_guard() from public, anon, authenticated;

alter table public.attachments enable row level security;

create policy attachments_select on public.attachments for select to authenticated using (owner_id = (select auth.uid()));
create policy attachments_insert on public.attachments for insert to authenticated with check (owner_id = (select auth.uid()));
-- 결과 스크린샷은 고치거나 지울 수 없다(감사 기록). 요청 자료만 순서·역할·설명을 바꾸고 지울 수 있다.
create policy attachments_update on public.attachments for update to authenticated
  using (owner_id = (select auth.uid()) and kind = 'request') with check (owner_id = (select auth.uid()) and kind = 'request');
create policy attachments_delete on public.attachments for delete to authenticated
  using (owner_id = (select auth.uid()) and kind = 'request');

-- 2. 비공개 Storage 버킷 -------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 자기 폴더(<owner>/)만 읽는다.
create policy attachments_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text);

-- 자기 업무 폴더(<owner>/<task>/)에만 올린다. 덮어쓰기(update) 정책은 없다.
create policy attachments_objects_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(storage.objects.name))[2] and t.owner_id = (select auth.uid())
    )
  );

-- 결과 스크린샷이 가리키는 파일은 지울 수 없다.
create policy attachments_objects_remove on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.attachments a where a.storage_path = storage.objects.name and a.kind = 'result'
    )
  );
