-- v0.2.5 Gemini 호출 기록 시험: 서버만 기록, 소유자만 읽음, 고칠 수 없음
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.expect_fail(q text, needle text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if position(needle in sqlerrm) = 0 then
      raise exception 'expected error containing "%", got "%" for: %', needle, sqlerrm, q;
    end if;
    return;
  end;
  raise exception 'expected failure "%" but succeeded: %', needle, q;
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);
set role authenticated;
select pg_temp.expect_fail($q$insert into ai_calls (owner_id, provider, ok) values ('11111111-1111-4111-8111-111111111111', 'gemini', true)$q$, 'row-level security');

select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
insert into ai_calls (owner_id, provider, key_slot, ok, http_status, prompt_chars, answer_chars) values
  ('11111111-1111-4111-8111-111111111111', 'gemini', 1, true, 200, 10, 20),
  ('22222222-2222-4222-8222-222222222222', 'gemini', null, false, 429, 5, 0);
select pg_temp.expect_fail($q$insert into ai_calls (owner_id, provider, ok) values ('11111111-1111-4111-8111-111111111111', 'openai', true)$q$, 'check');

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);
set role authenticated;
select pg_temp.check((select count(*) from ai_calls) = 1, '소유자는 자기 기록만 읽음');
with u as (update ai_calls set ok = false returning 1) select pg_temp.check((select count(*) from u) = 0, '사용량 기록은 고칠 수 없음');
with d as (delete from ai_calls returning 1) select pg_temp.check((select count(*) from d) = 0, '사용량 기록은 지울 수 없음');
reset role;
\echo Gemini 호출 기록 테스트 완료
