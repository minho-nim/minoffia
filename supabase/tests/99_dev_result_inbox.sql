-- v0.4.3 결과 자동 저장: 결과 제출표는 작업이 있어야 하고, 받은 결과는 사용자가 고칠 수 없으며 상태만 한 번 바꾼다
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

reset role;
insert into tasks (id, owner_id, project_id, title, type, assignee) values ('c9c9c9c9-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '결과 자동 저장', 'dev', 'claude');
alter table agent_assignments disable trigger user;
insert into agent_assignments (id, owner_id, task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status)
  values ('c8c8c8c8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c9c9c9c9-0000-4000-8000-000000000001', 1, 'W1', 'claude', 'manual_handoff', 'started');
alter table agent_assignments enable trigger user;

select pg_temp.expect_fail($q$insert into plan_submit_tokens (owner_id, task_id, spec_revision, token_hash, expires_at, kind) values ('11111111-1111-4111-8111-111111111111', 'c9c9c9c9-0000-4000-8000-000000000001', 1, repeat('b', 64), now() + interval '1 day', 'result')$q$, 'plan_submit_tokens_result_needs_assignment');
insert into plan_submit_tokens (owner_id, task_id, spec_revision, token_hash, expires_at, kind, assignment_id)
  values ('11111111-1111-4111-8111-111111111111', 'c9c9c9c9-0000-4000-8000-000000000001', 1, repeat('c', 64), now() + interval '1 day', 'result', 'c8c8c8c8-0000-4000-8000-000000000001');
insert into dev_result_inbox (owner_id, task_id, assignment_id, summary, diff)
  values ('11111111-1111-4111-8111-111111111111', 'c9c9c9c9-0000-4000-8000-000000000001', 'c8c8c8c8-0000-4000-8000-000000000001', '요약', 'diff');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_fail($q$insert into dev_result_inbox (owner_id, task_id, assignment_id) values ('11111111-1111-4111-8111-111111111111', 'c9c9c9c9-0000-4000-8000-000000000001', 'c8c8c8c8-0000-4000-8000-000000000001')$q$, 'row-level security');
select pg_temp.expect_fail($q$update dev_result_inbox set diff = 'x'$q$, 'only status and note');
update dev_result_inbox set status = 'imported';
select pg_temp.expect_fail($q$update dev_result_inbox set status = 'invalid'$q$, 'already handled');
insert into result_packages (task_id, revision, plan_revision, work_item_id, source, summary) values ('c9c9c9c9-0000-4000-8000-000000000001', 1, 1, 'W1', 'claude_session_auto', '자동');
select pg_temp.check((select source from result_packages where task_id = 'c9c9c9c9-0000-4000-8000-000000000001') = 'claude_session_auto', '세션 결과 출처');

select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from dev_result_inbox) = 0, '남의 결과는 안 보임');
reset role;
\o
\echo '결과 자동 저장 테스트 완료'
