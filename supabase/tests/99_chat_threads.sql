-- v0.7.99 챗봇 지난 대화: 본인 대화만 보고 쓰고 지운다
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into chat_threads (id, title, messages) values ('c0670000-0000-4000-8000-000000000001', '날씨 대화', '[{"role":"user","text":"안녕"}]');
select pg_temp.check((select count(*) from chat_threads) = 1, 'owner sees own thread');
update chat_threads set messages = messages || '[{"role":"model","text":"안녕하세요"}]'::jsonb, updated_at = now() where id = 'c0670000-0000-4000-8000-000000000001';
select pg_temp.check((select jsonb_array_length(messages) from chat_threads) = 2, 'owner appends messages');

select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from chat_threads) = 0, 'other owner sees nothing');
update chat_threads set title = 'hacked';
delete from chat_threads;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select title from chat_threads) = '날씨 대화', 'other owner cannot change or delete');

do $$ begin
  begin
    insert into chat_threads (title, messages) values ('x', '{"not":"array"}');
    raise exception 'object messages should fail';
  exception when check_violation then null;
  end;
end $$;
select pg_temp.check(true, 'messages must be an array');
delete from chat_threads;
select pg_temp.check((select count(*) from chat_threads) = 0, 'owner deletes own thread');

reset role;

-- 0068: 되묻기·챗봇 사용량 기록이 purpose 검사에 막히지 않는다
insert into auth.users (id, email) values ('22222222-2222-4222-8222-222222222222', 'p@example.invalid') on conflict do nothing;
insert into ai_calls (owner_id, provider, purpose, key_slot, ok, model) values
  ('22222222-2222-4222-8222-222222222222', 'gemini', 'clarify', 1, true, 'm'),
  ('22222222-2222-4222-8222-222222222222', 'gemini', 'chat', 2, true, 'm');
select pg_temp.check((select count(*) from ai_calls where purpose in ('clarify', 'chat')) = 2, 'clarify·chat 사용량 기록');
delete from ai_calls where owner_id = '22222222-2222-4222-8222-222222222222';
