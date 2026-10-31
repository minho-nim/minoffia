-- v0.4.12 휴대폰 알림(무료 웹 푸시, 소유자 승인 2026-10-31): 기획서·계획·견본·결과가 오거나 막히면 휴대폰에 알린다.
-- 1) push_keys: VAPID 키 한 쌍(서버 push 함수가 처음 부를 때 만든다). 개인키는 service_role만 읽는다.
-- 2) push_subscriptions: 기기별 구독. 저장은 push 함수(소유자 확인)만, 사용자는 자기 것 보기·지우기만.
-- 3) push_outbox: 보낼 알림 줄. 아래 트리거가 넣고, pg_net이 push 함수(flush)를 깨워 보낸다. AI 호출 없음(토큰 0).

create table public.push_keys (
  id smallint primary key default 1 check (id = 1),
  public_key text not null check (char_length(public_key) between 80 and 100),
  private_jwk jsonb not null,
  flush_url text not null default '' check (flush_url = '' or flush_url like 'https://%/functions/v1/push'),
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;
-- 정책 없음: 사용자·익명은 읽지도 쓰지도 못한다(service_role만).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 80 and 100),
  auth text not null check (char_length(auth) between 16 and 40),
  device text not null default '' check (char_length(device) <= 120),
  fail_count integer not null default 0,
  last_ok_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on public.push_subscriptions (owner_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (owner_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (owner_id = (select auth.uid()));

create table public.push_outbox (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  kind text not null check (kind in ('spec', 'question', 'plan', 'prototype', 'result', 'blocked', 'test')),
  title text not null check (char_length(title) <= 80),
  body text not null default '' check (char_length(body) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_outbox_pending_idx on public.push_outbox (created_at) where sent_at is null;
alter table public.push_outbox enable row level security;
-- 정책 없음(service_role만).

-- pg_net이 있으면(운영 Supabase) 켠다. 로컬 시험 DB에는 없어서 건너뛴다.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create schema if not exists extensions;
    create extension if not exists pg_net schema extensions;
  end if;
end $$;

-- 알림 한 줄을 넣고 push 함수를 깨운다. 같은 업무·같은 종류가 2분 안에 또 오면 한 번만.
create or replace function public.push_enqueue(p_owner uuid, p_task uuid, p_kind text, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_url text;
begin
  if exists (select 1 from push_outbox where task_id is not distinct from p_task and kind = p_kind and created_at > now() - interval '2 minutes') then
    return;
  end if;
  select left(title, 200) into v_body from tasks where id = p_task;
  insert into push_outbox (owner_id, task_id, kind, title, body) values (p_owner, p_task, p_kind, p_title, coalesce(v_body, ''));
  -- 구독이 없으면 깨울 필요가 없다.
  if not exists (select 1 from push_subscriptions where owner_id = p_owner) then
    return;
  end if;
  select flush_url into v_url from push_keys where id = 1;
  if coalesce(v_url, '') <> '' and to_regnamespace('net') is not null then
    -- 요청은 이 트랜잭션이 끝난 뒤 보내진다(알림 줄이 보인 다음). 내용은 보내지 않고 "보낼 것 확인"만 알린다.
    execute 'select net.http_post(url := $1, body := $2::jsonb)' using v_url, '{"action":"flush"}';
  end if;
end;
$$;
revoke execute on function public.push_enqueue(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.push_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'task_specs' then
    -- Gemini 초안만(ChatGPT 기획서는 사용자가 앱에서 직접 붙여넣는다)
    if new.planner = 'gemini_draft' then
      if new.intent = 'ambiguous' or (new.final_prompt = '' and new.answer <> '') then
        perform push_enqueue(new.owner_id, new.task_id, 'question', '확인 질문이 왔어요');
      else
        perform push_enqueue(new.owner_id, new.task_id, 'spec', '기획서 초안이 왔어요');
      end if;
    end if;
  elsif tg_table_name = 'pm_plan_inbox' then
    perform push_enqueue(new.owner_id, new.task_id, 'plan', 'PM 계획이 왔어요');
  elsif tg_table_name = 'dev_result_inbox' then
    perform push_enqueue(new.owner_id, new.task_id, 'result', '개발 결과가 왔어요');
  elsif tg_table_name = 'attachments' then
    if new.kind = 'prototype' then
      perform push_enqueue(new.owner_id, new.task_id, 'prototype', '견본이 왔어요');
    end if;
  elsif tg_table_name = 'tasks' then
    if new.dispatch_state = 'failed' and old.dispatch_state is distinct from 'failed' then
      perform push_enqueue(new.owner_id, new.id, 'blocked', '업무가 막혔어요');
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.push_on_event() from public, anon, authenticated;

create trigger push_task_specs after insert on public.task_specs for each row execute function public.push_on_event();
create trigger push_pm_plan_inbox after insert on public.pm_plan_inbox for each row execute function public.push_on_event();
create trigger push_dev_result_inbox after insert on public.dev_result_inbox for each row execute function public.push_on_event();
create trigger push_attachments after insert on public.attachments for each row execute function public.push_on_event();
create trigger push_tasks_failed after update of dispatch_state on public.tasks for each row execute function public.push_on_event();
