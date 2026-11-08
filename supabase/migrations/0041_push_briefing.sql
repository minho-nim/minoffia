-- 아침·저녁 브리핑 알림(v0.5.51, 소유자 목록 16번, 2026-11-08 "9시 21시"): 하루 두 번(한국 시간 9시·21시)
-- "내 차례 N · 막힘 N · AI 작업 중 N · 지난 12시간 끝남 N"을 휴대폰에 한 번 알린다. 기록을 세기만 한다(AI 호출 없음).
-- shortcut: 업무 단계는 앱이 마지막으로 맞춘 tasks.stage를 쓴다(앱을 안 연 사이 바뀐 단계는 늦게 반영), 서버가 단계를 직접 계산하게 되면 그 값을 쓴다.

alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('spec', 'question', 'plan', 'prototype', 'result', 'blocked', 'test', 'briefing'));

create or replace function public.push_briefing(p_label text)
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
    select o.owner_id,
      count(t.id) filter (where t.status <> 'done' and t.stage in ('spec_ready', 'needs_clarification', 'development_approval_pending', 'agent_handoff_pending', 'result_review', 'github_approval_pending', 'deployment_approval_pending')) as my_turn,
      count(t.id) filter (where t.status <> 'done' and t.stage in ('failed', 'integration_blocked', 'rate_limited', 'paused')) as blocked,
      count(t.id) filter (where t.status <> 'done' and t.stage in ('received', 'media_analysis', 'planner_handoff', 'planning', 'pm_queued', 'dispatching', 'executing', 'validation', 'github_uploading', 'pr_review', 'deploying')) as working,
      count(t.id) filter (where (t.status = 'done' or t.stage = 'completed') and t.updated_at > now() - interval '12 hours') as done_recent
    from (select distinct owner_id from push_subscriptions) o
    left join tasks t on t.owner_id = o.owner_id
    group by o.owner_id
  loop
    -- 같은 사람에게 같은 브리핑이 1시간 안에 또 가지 않게(일정이 두 번 돌아도 한 번만)
    if exists (select 1 from push_outbox where owner_id = r.owner_id and kind = 'briefing' and created_at > now() - interval '1 hour') then
      continue;
    end if;
    insert into push_outbox (owner_id, task_id, kind, title, body)
    values (
      r.owner_id, null, 'briefing',
      left(coalesce(nullif(p_label, ''), '브리핑'), 40),
      left(format('내 차례 %s · 막힘 %s · AI 작업 중 %s · 지난 12시간 끝남 %s', r.my_turn, r.blocked, r.working, r.done_recent), 200)
    );
    v_sent := v_sent + 1;
  end loop;
  select flush_url into v_url from push_keys where id = 1;
  if v_sent > 0 and coalesce(v_url, '') <> '' and to_regnamespace('net') is not null then
    execute 'select net.http_post(url := $1, body := $2::jsonb)' using v_url, '{"action":"flush"}';
  end if;
  return v_sent;
end;
$$;
revoke execute on function public.push_briefing(text) from public, anon, authenticated;

-- pg_cron이 있으면(운영 Supabase) 하루 두 번 돌린다. UTC 0시 = 한국 9시, UTC 12시 = 한국 21시. 로컬 시험 DB에는 없어서 건너뛴다.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('minoffia-briefing-morning', '0 0 * * *', $c$select public.push_briefing('아침 브리핑')$c$);
    perform cron.schedule('minoffia-briefing-evening', '0 12 * * *', $c$select public.push_briefing('저녁 브리핑')$c$);
  end if;
end $$;
