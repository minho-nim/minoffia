-- v0.7.99 소유자 "챗봇형(GPT·Claude에 묻듯이), 지난 대화는 서버에 둔다" + "모두 상한은 없이".
-- 1) chat_threads: 챗봇 모드 대화 한 줄기(제목·메시지 목록). 소유자만 보고 쓴다(RLS). 메시지는 jsonb 배열(2MB 미만).
-- 2) claim_gemini_pm: Gemini 개발 계획의 하루 상한이 함수 안에서 20회로 묶여 있던 것을 뺐다.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '새 대화' check (char_length(title) between 1 and 200),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array' and pg_column_size(messages) < 2000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_threads_owner_updated_idx on public.chat_threads (owner_id, updated_at desc);
alter table public.chat_threads enable row level security;
drop policy if exists chat_threads_select on public.chat_threads;
drop policy if exists chat_threads_insert on public.chat_threads;
drop policy if exists chat_threads_update on public.chat_threads;
drop policy if exists chat_threads_delete on public.chat_threads;
create policy chat_threads_select on public.chat_threads for select to authenticated using (owner_id = (select auth.uid()));
create policy chat_threads_insert on public.chat_threads for insert to authenticated with check (owner_id = (select auth.uid()));
create policy chat_threads_update on public.chat_threads for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy chat_threads_delete on public.chat_threads for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.chat_threads from anon;
grant select, insert, update, delete on public.chat_threads to authenticated;

create or replace function public.claim_gemini_pm(p_task uuid, p_owner uuid, p_spec integer, p_cap integer, p_model text)
returns table (state text, draft_id uuid, call_id uuid, plan_text text, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.gemini_pm_drafts;
  v_context text;
  v_call uuid;
  v_used integer;
  v_latest integer;
  v_midnight timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  -- 일일 상한과 같은 요청의 예약을 하나의 잠금 안에서 확인한다.
  perform pg_advisory_xact_lock(hashtext('gemini-pm:' || p_owner::text));
  if not exists (select 1 from tasks where id = p_task and owner_id = p_owner) then
    return query select 'rejected', null::uuid, null::uuid, null::text, 'not_owner'; return;
  end if;
  select max(revision) into v_latest from task_specs where task_id = p_task;
  if v_latest is distinct from p_spec or not exists (
    select 1 from approvals where task_id = p_task and gate = 'A' and decision = 'approved' and approved_revision = p_spec
  ) then
    return query select 'rejected', null::uuid, null::uuid, null::text, 'stale_spec'; return;
  end if;
  -- 수정 요청이나 PM 확인 질문의 답이 추가되면 같은 기획서라도 새 요청이다.
  select md5(concat_ws('|',
    (select max(created_at)::text from revision_requests where task_id = p_task and spec_revision = p_spec),
    (select max(created_at)::text from clarifications where task_id = p_task),
    (select p.repo from projects p join tasks t on t.project_id = p.id where t.id = p_task)
  )) into v_context;
  select * into v_draft from gemini_pm_drafts d where d.task_id = p_task and d.spec_revision = p_spec and d.context_key = v_context;
  if found then
    if v_draft.state = 'completed' then
      return query select 'cached', v_draft.id, v_draft.call_id, v_draft.plan_text, ''::text; return;
    elsif v_draft.state = 'running' and v_draft.locked_until > now() then
      return query select 'busy', v_draft.id, v_draft.call_id, null::text, 'in_progress'; return;
    end if;
  end if;
  select count(*) into v_used from ai_calls where owner_id = p_owner and purpose = 'pm' and created_at >= v_midnight;
  -- v0.7.99 소유자 "모두 상한은 없이": 함수 안의 20회 고정 상한을 뺐다(서버가 넘긴 값만, 기본은 상한 없음)
  if v_used >= greatest(1, coalesce(p_cap, 1000000)) then
    return query select 'rejected', null::uuid, null::uuid, null::text, 'daily_cap'; return;
  end if;
  insert into ai_calls(owner_id, provider, purpose, ok, model)
    values (p_owner, 'gemini', 'pm', false, left(p_model, 100)) returning id into v_call;
  insert into gemini_pm_drafts(owner_id, task_id, spec_revision, context_key, call_id, state, locked_until)
    values (p_owner, p_task, p_spec, v_context, v_call, 'running', now() + interval '5 minutes')
    on conflict (task_id, spec_revision, context_key) do update
      set call_id = excluded.call_id, state = 'running', locked_until = excluded.locked_until, plan_text = null
    returning * into v_draft;
  return query select 'claimed', v_draft.id, v_call, null::text, ''::text;
end;
$$;
revoke all on function public.claim_gemini_pm(uuid, uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.claim_gemini_pm(uuid, uuid, integer, integer, text) to service_role;
