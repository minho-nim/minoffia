-- MinLab AI Office v0.3.5: 새 플로우 07단계 Prototype First.
-- Claude PM 계획(pm_plans.plan)의 development_mode가 'prototype_first'면:
--   AI Studio Build 시안(ZIP·HTML·이미지·문서)을 '시안' 첨부(kind 'prototype')로 올리고, 사용자가 P(시안 승인)를 해야
--   Codex 작업의 E(실행 승인)를 할 수 있다. 시안은 P 승인 전까지 올리고 지우고 설명을 고칠 수 있고, P 뒤에는 잠긴다.
-- 'direct'(또는 값 없음)는 지금처럼 바로 개발한다. 규칙은 src/domain/workflow.ts, src/domain/attachments.ts 와 같아야 한다.

-- 1. P 게이트 ---------------------------------------------------------------
alter table public.approvals drop constraint approvals_gate_check;
alter table public.approvals add constraint approvals_gate_check check (gate in ('A', 'E', 'P', 'B', 'C'));

-- 2. 시안 첨부 -----------------------------------------------------------------
alter table public.attachments add column plan_revision integer;

alter table public.attachments drop constraint attachments_check;
alter table public.attachments add constraint attachments_check check (
  ((kind = 'result') = (result_revision is not null)) and ((kind = 'prototype') = (plan_revision is not null))
);

alter table public.attachments drop constraint attachments_kind_check;
alter table public.attachments add constraint attachments_kind_check check (kind in ('request', 'result', 'prototype'));

alter table public.attachments drop constraint attachments_role_check;
alter table public.attachments add constraint attachments_role_check
  check (role in ('current', 'target', 'error', 'reference', 'document', 'prototype', 'before', 'after'));

alter table public.attachments drop constraint attachments_check1;
alter table public.attachments add constraint attachments_check1 check (
  (kind = 'request' and mime like 'image/%' and role in ('current', 'target', 'error', 'reference'))
  or (kind = 'request' and mime not like 'image/%' and role = 'document')
  or (kind = 'prototype' and role = 'prototype')
  or (kind = 'result' and mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') and role in ('before', 'after'))
);

-- 시안도 P 승인 전까지는 설명을 고치고 지울 수 있다(트리거가 P 뒤 잠금).
drop policy attachments_update on public.attachments;
drop policy attachments_delete on public.attachments;
create policy attachments_update on public.attachments for update to authenticated
  using (owner_id = (select auth.uid()) and kind in ('request', 'prototype'))
  with check (owner_id = (select auth.uid()) and kind in ('request', 'prototype'));
create policy attachments_delete on public.attachments for delete to authenticated
  using (owner_id = (select auth.uid()) and kind in ('request', 'prototype'));

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
  v_plan integer;
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
    new.plan_revision := old.plan_revision;
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
  elsif v_row.kind = 'prototype' then
    -- 시안은 최신 계획이 prototype_first일 때만, P(시안 승인) 전까지만 바꾼다.
    select max(plan_revision) into v_plan from pm_plans where task_id = v_row.task_id;
    if v_plan is null or v_row.plan_revision is distinct from v_plan then
      if tg_op = 'INSERT' then
        raise exception 'prototype must target the latest plan';
      end if;
    elsif tg_op = 'INSERT' and coalesce((select plan ->> 'development_mode' from pm_plans where task_id = v_row.task_id and plan_revision = v_plan), 'direct') <> 'prototype_first' then
      raise exception 'plan is not prototype_first';
    end if;
    if exists (
      select 1 from approvals a
      where a.task_id = v_row.task_id and a.gate = 'P' and a.decision = 'approved' and a.approved_revision = v_row.plan_revision
    ) then
      raise exception 'prototype is locked after P approval';
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
    where task_id = new.task_id and kind = new.kind
      and result_revision is not distinct from new.result_revision
      and plan_revision is not distinct from new.plan_revision;
    if v_count >= (case when new.kind = 'result' then 6 else 10 end) then
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

revoke all on function public.attachments_guard() from public, anon, authenticated;

-- 3. 승인 규칙: P 추가, prototype_first 계획의 Codex 작업 E는 P 뒤에만 ----------------
create or replace function public.approvals_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec integer;
  v_plan integer;
  v_plan_spec integer;
  v_result integer;
  v_mode text;
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.owner_id = new.owner_id) then
    raise exception 'task does not belong to owner';
  end if;
  new.actor := coalesce(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', ''), new.actor);
  if new.decision <> 'approved' then
    return new;
  end if;

  select max(revision) into v_spec from task_specs where task_id = new.task_id;

  if new.gate = 'A' then
    if v_spec is null or new.approved_revision <> v_spec then
      raise exception 'A must approve the latest spec revision';
    end if;
    if (select intent from task_specs where task_id = new.task_id and revision = v_spec) in ('question', 'ambiguous') then
      raise exception 'question/ambiguous specs cannot be approved for development';
    end if;

  elsif new.gate in ('E', 'P') then
    select max(plan_revision) into v_plan from pm_plans where task_id = new.task_id;
    select approved_spec_revision, coalesce(plan ->> 'development_mode', 'direct') into v_plan_spec, v_mode
      from pm_plans where task_id = new.task_id and plan_revision = v_plan;
    if v_plan is null or new.approved_revision <> v_plan then
      raise exception '% must approve the latest plan revision', new.gate;
    end if;
    if v_plan_spec <> v_spec or not exists (
      select 1 from approvals a where a.task_id = new.task_id and a.gate = 'A' and a.decision = 'approved' and a.approved_revision = v_spec
    ) then
      raise exception 'plan is stale: latest spec is not A-approved';
    end if;

    if new.gate = 'P' then
      if v_mode <> 'prototype_first' then
        raise exception 'P is only for prototype_first plans';
      end if;
      if not exists (select 1 from attachments x where x.task_id = new.task_id and x.kind = 'prototype' and x.plan_revision = v_plan) then
        raise exception 'P requires an uploaded prototype';
      end if;
    else
      if new.work_item_id = '' or not exists (
        select 1 from agent_assignments s where s.task_id = new.task_id and s.plan_revision = v_plan and s.work_item_id = new.work_item_id
      ) then
        raise exception 'E must name a work item of the latest plan';
      end if;
      -- 시안 먼저: Codex 작업은 시안 승인(P) 뒤에만 실행 승인한다(시안을 보존하며 통합).
      if v_mode = 'prototype_first' and exists (
        select 1 from agent_assignments s
        where s.task_id = new.task_id and s.plan_revision = v_plan and s.work_item_id = new.work_item_id and s.assignee = 'codex'
      ) and not exists (
        select 1 from approvals a where a.task_id = new.task_id and a.gate = 'P' and a.decision = 'approved' and a.approved_revision = v_plan
      ) then
        raise exception 'prototype_first: approve the prototype (P) before Codex execution';
      end if;
    end if;

  elsif new.gate = 'B' then
    select max(revision) into v_result from result_packages where task_id = new.task_id;
    if v_result is null or new.approved_revision <> v_result then
      raise exception 'B must approve the latest result package';
    end if;
    if exists (select 1 from revision_requests r where r.task_id = new.task_id and r.result_revision = v_result) then
      raise exception 'B not allowed: revision was requested for this result';
    end if;

  elsif new.gate = 'C' then
    select max(revision) into v_result from result_packages where task_id = new.task_id;
    if v_result is null or new.approved_revision <> v_result or not exists (
      select 1 from approvals a where a.task_id = new.task_id and a.gate = 'B' and a.decision = 'approved' and a.approved_revision = v_result
    ) then
      raise exception 'C requires B approval of the same result package';
    end if;
    -- PR의 CI 통과와 main 병합을 서버가 GitHub에서 확인한 최신 기록이 있어야 한다(v0.2 §8).
    if not exists (
      select 1 from (
        select c.ci_state, c.merged, c.pr_url from pr_checks c
        where c.task_id = new.task_id order by c.checked_at desc limit 1
      ) last
      join tasks t on t.id = new.task_id and t.pr_url = last.pr_url
      where last.ci_state = 'success' and last.merged
    ) then
      raise exception 'C requires a passing CI and merged PR checked by the server';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.approvals_guard() from public, anon, authenticated;
