-- v0.4.2 PM 계획 자동 저장: 제출표는 사용자에게 안 보이고, 받은 계획은 상태만 한 번 바꿀 수 있다
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

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

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into tasks (id, project_id, title, type, assignee) values ('b7b7b7b7-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '계획 자동 저장', 'dev', 'codex');

reset role;
insert into plan_submit_tokens (owner_id, task_id, spec_revision, token_hash, expires_at)
  values ('11111111-1111-4111-8111-111111111111', 'b7b7b7b7-0000-4000-8000-000000000001', 1, repeat('a', 64), now() + interval '6 hours');
insert into pm_plan_inbox (id, owner_id, task_id, spec_revision, plan_text)
  values ('b8b8b8b8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b7b7b7b7-0000-4000-8000-000000000001', 1, '{"task_id":"x"}');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select count(*) from plan_submit_tokens) = 0, '제출표는 사용자에게 안 보임');
select pg_temp.expect_fail($q$insert into pm_plan_inbox (owner_id, task_id, spec_revision, plan_text) values ('11111111-1111-4111-8111-111111111111', 'b7b7b7b7-0000-4000-8000-000000000001', 1, '{}')$q$, 'row-level security');
select pg_temp.expect_fail($q$update pm_plan_inbox set plan_text = '{"x":1}'$q$, 'only status and note');
update pm_plan_inbox set status = 'imported' where status = 'new';
select pg_temp.check((select status from pm_plan_inbox) = 'imported', '상태를 한 번 바꿈');
select pg_temp.expect_fail($q$update pm_plan_inbox set status = 'invalid'$q$, 'already handled');

select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from pm_plan_inbox) = 0, '남의 계획은 안 보임');
reset role;
\o
\echo 'PM 계획 자동 저장 테스트 완료'
