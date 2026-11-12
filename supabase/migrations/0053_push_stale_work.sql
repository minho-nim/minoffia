-- MinLab AI Office v0.6.80(소유자 2026-11-12 "개발 중에 너무 오래 걸리면 대화창이나 알림으로 알려줘"):
-- 시작한 지 오래됐는데 결과 소식이 없는 작업을 10분마다 찾아 휴대폰에 한 번 알린다(시작마다 한 번). 기록만 읽는다(AI 호출 없음).
-- 기준은 앱의 staleStart(src/domain/reassign.ts STALE_MIN)와 같다: Gemini 35분, Claude 60분, Codex 120분, 시작 확인 없음('starting') 10분.
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('spec', 'question', 'plan', 'prototype', 'result', 'blocked', 'test', 'briefing', 'stale'));

create or replace function public.push_stale_work()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sent integer := 0;
  v_url text;
begin
  for r in
    select a.owner_id, a.task_id, a.assignee, a.work_item_id, a.dispatch_status,
      coalesce(a.started_at, a.updated_at) as since
    from agent_assignments a
    join tasks t on t.id = a.task_id and t.status <> 'done'
    where a.dispatch_status in ('starting', 'started')
      and exists (select 1 from push_subscriptions s where s.owner_id = a.owner_id)
      and coalesce(a.started_at, a.updated_at) < now() - case
        when a.dispatch_status = 'starting' then interval '10 minutes'
        when a.assignee = 'gemini' then interval '35 minutes'
        when a.assignee = 'codex' then interval '120 minutes'
        else interval '60 minutes' end
  loop
    -- 이번 시작 뒤로 이미 알렸으면 건너뛴다(같은 시작은 한 번만)
    if exists (select 1 from push_outbox o where o.task_id = r.task_id and o.kind = 'stale' and o.created_at > r.since) then
      continue;
    end if;
    insert into push_outbox (owner_id, task_id, kind, title, body)
    select r.owner_id, r.task_id, 'stale',
      left(format('%s %s: %s분째 소식 없음 — 다시 시도·넘기기',
        case r.assignee when 'claude' then 'Claude' when 'codex' then 'Codex' when 'gemini' then 'Gemini' else r.assignee end,
        r.work_item_id, floor(extract(epoch from now() - r.since) / 60)::int), 80),
      left(coalesce(t.title, ''), 200)
    from tasks t where t.id = r.task_id;
    v_sent := v_sent + 1;
  end loop;
  select flush_url into v_url from push_keys where id = 1;
  if v_sent > 0 and coalesce(v_url, '') <> '' and to_regnamespace('net') is not null then
    execute 'select net.http_post(url := $1, body := $2::jsonb)' using v_url, '{"action":"flush"}';
  end if;
  return v_sent;
end;
$$;
revoke execute on function public.push_stale_work() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('minoffia-stale-work', '*/10 * * * *', $c$select public.push_stale_work()$c$);
  end if;
end $$;
