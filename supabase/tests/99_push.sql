-- v0.4.12 휴대폰 알림: 이벤트가 오면 알림 줄이 생기고, 사용자는 키·알림 줄을 못 읽고 구독은 자기 것만 본다
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

reset role;
insert into tasks (id, owner_id, project_id, title, type, assignee) values ('d1d1d1d1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '알림 시험', 'dev', 'claude');
insert into push_keys (public_key, private_jwk) values (repeat('k', 87), '{"kty":"EC"}');
insert into push_subscriptions (owner_id, endpoint, p256dh, auth) values ('11111111-1111-4111-8111-111111111111', 'https://fcm.googleapis.com/fcm/send/a', repeat('p', 87), repeat('a', 22));

insert into task_specs (owner_id, task_id, revision, intent, planner, user_original_text, final_prompt) values ('11111111-1111-4111-8111-111111111111', 'd1d1d1d1-0000-4000-8000-000000000001', 1, 'change_request', 'gemini_draft', '원문', '기획');
insert into task_specs (owner_id, task_id, revision, intent, planner, user_original_text, answer) values ('11111111-1111-4111-8111-111111111111', 'd1d1d1d1-0000-4000-8000-000000000001', 2, 'ambiguous', 'gemini_draft', '원문', '어느 화면?');
insert into task_specs (owner_id, task_id, revision, intent, planner, user_original_text, final_prompt) values ('11111111-1111-4111-8111-111111111111', 'd1d1d1d1-0000-4000-8000-000000000001', 3, 'change_request', 'gemini_draft', '원문', '또 기획');
insert into task_specs (owner_id, task_id, revision, intent, planner, user_original_text, final_prompt) values ('11111111-1111-4111-8111-111111111111', 'd1d1d1d1-0000-4000-8000-000000000001', 4, 'change_request', 'chatgpt_manual', '원문', '수동');
select pg_temp.check((select count(*) from push_outbox where task_id = 'd1d1d1d1-0000-4000-8000-000000000001' and kind = 'spec') = 1, '같은 업무 기획서 알림은 2분 안에 한 번, ChatGPT 수동 기획서는 알리지 않음');
select pg_temp.check((select count(*) from push_outbox where task_id = 'd1d1d1d1-0000-4000-8000-000000000001' and kind = 'question') = 1, '확인 질문 알림');
select pg_temp.check((select body from push_outbox where task_id = 'd1d1d1d1-0000-4000-8000-000000000001' and kind = 'spec') = '알림 시험', '알림 본문은 업무 제목');

insert into pm_plan_inbox (owner_id, task_id, spec_revision, plan_text) values ('11111111-1111-4111-8111-111111111111', 'd1d1d1d1-0000-4000-8000-000000000001', 1, '{}');
select pg_temp.check((select count(*) from push_outbox where task_id = 'd1d1d1d1-0000-4000-8000-000000000001' and kind = 'plan') = 1, 'PM 계획 알림');

select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update tasks set dispatch_state = 'failed' where id = 'd1d1d1d1-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '', false);
select pg_temp.check((select count(*) from push_outbox where task_id = 'd1d1d1d1-0000-4000-8000-000000000001' and kind = 'blocked') = 1, '막힘 알림');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select count(*) from push_keys) = 0, '사용자는 VAPID 키를 못 읽음');
select pg_temp.check((select count(*) from push_outbox) = 0, '사용자는 알림 줄을 못 읽음');
select pg_temp.check((select count(*) from push_subscriptions) = 1, '자기 구독은 보임');
do $$ begin
  begin
    insert into push_subscriptions (owner_id, endpoint, p256dh, auth) values ('11111111-1111-4111-8111-111111111111', 'https://evil.example.com/x', repeat('p', 87), repeat('a', 22));
    raise exception 'insert should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from push_subscriptions) = 0, '남의 구독은 안 보임');
reset role;

-- v0.5.51 아침·저녁 브리핑: 구독한 사람에게 한 줄, 1시간 안에 다시 돌려도 한 번만, 사용자는 직접 못 부름
update tasks set stage = 'result_review', status = 'review' where id = 'd1d1d1d1-0000-4000-8000-000000000001';
select pg_temp.check(public.push_briefing('아침 브리핑') = 1, '브리핑 한 줄');
select pg_temp.check((select body from push_outbox where kind = 'briefing') like '내 차례 1 · 막힘 0 · %', '브리핑 본문은 개수');
select pg_temp.check(public.push_briefing('아침 브리핑') = 0, '1시간 안에 또 돌려도 한 번만');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $$ begin
  begin
    perform public.push_briefing('x');
    raise exception 'call should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
