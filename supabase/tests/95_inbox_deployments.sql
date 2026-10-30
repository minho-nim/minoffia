-- v0.3.0 입력창 대화 저장과 운영 배포 기록 시험
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

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  perform set_config('role', 'service_role', false);
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- 입력창 대화: 본인 행 하나만, 다른 사람 것은 보이지 않는다
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into inbox_state (messages, pending) values ('[{"id":"1","from":"me","text":"안녕"}]', '{"kind":"question","text":"안녕"}');
update inbox_state set messages = '[]', pending = null, updated_at = now();
select pg_temp.check((select count(*) from inbox_state) = 1, 'own inbox row');
select pg_temp.expect_fail($q$insert into inbox_state (owner_id) values ('22222222-2222-4222-8222-222222222222')$q$, 'row-level security');
select pg_temp.expect_fail($q$update inbox_state set messages = '{}'$q$, 'inbox_state_messages_check');
select pg_temp.expect_fail($q$update inbox_state set messages = (select jsonb_agg(i) from generate_series(1, 61) i)$q$, 'inbox_state_messages_check');

select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from inbox_state) = 0, 'other user sees nothing');
\o /dev/null

-- 대화 기록: 남의 프로젝트에 연결 불가, 고칠 수 없음, 본인은 지울 수 있음
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into chat_messages (role, text) values ('me', '안녕');
insert into chat_messages (role, text, project_id) values ('office', '접수했어요', 'aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.expect_fail($q$insert into chat_messages (role, text) values ('bot', 'x')$q$, 'chat_messages_role_check');
select pg_temp.expect_fail($q$insert into chat_messages (role, text) values ('me', '')$q$, 'chat_messages_text_check');
select pg_temp.expect_fail($q$insert into chat_messages (owner_id, role, text) values ('22222222-2222-4222-8222-222222222222', 'me', 'x')$q$, 'row-level security');
with u as (update chat_messages set text = '바꿈' returning 1) select pg_temp.check((select count(*) from u) = 0, 'chat cannot be edited');
select pg_temp.check((select count(*) from chat_messages) = 2, 'chat kept');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from chat_messages) = 0, 'other user sees no chat');
with d as (delete from chat_messages returning 1) select pg_temp.check((select count(*) from d) = 0, 'other user cannot delete chat');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
with d as (delete from chat_messages where role = 'me' returning 1) select pg_temp.check((select count(*) from d) = 1, 'owner deletes own chat');
select pg_temp.check((select count(*) from chat_messages) = 1, 'rest kept');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.expect_fail($q$insert into chat_messages (role, text, project_id) values ('me', 'x', 'aaaaaaaa-0000-4000-8000-000000000001')$q$, 'project does not belong to owner');

-- 배포 기록: 사용자는 쓸 수 없고, 서버도 C 승인 없이는 성공 기록을 남길 수 없다
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into tasks (id, project_id, title, type, assignee) values ('dededede-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '배포 시험', 'dev', 'codex');
select pg_temp.expect_fail($q$insert into deployments (owner_id, task_id, repo, ok) values ('11111111-1111-4111-8111-111111111111', 'dededede-0000-4000-8000-000000000001', 'o/r', false)$q$, 'row-level security');

select pg_temp.as_service();
select pg_temp.expect_fail($q$insert into deployments (owner_id, task_id, repo, ok) values ('11111111-1111-4111-8111-111111111111', 'dededede-0000-4000-8000-000000000001', 'o/r', true)$q$, 'deployment requires C approval');
select pg_temp.expect_fail($q$insert into deployments (owner_id, task_id, repo, ok) values ('22222222-2222-4222-8222-222222222222', 'dededede-0000-4000-8000-000000000001', 'o/r', false)$q$, 'task does not belong to owner');
select pg_temp.expect_fail($q$insert into deployments (owner_id, task_id, repo, branch, ok) values ('11111111-1111-4111-8111-111111111111', 'dededede-0000-4000-8000-000000000001', 'o/r', 'main', false)$q$, 'deployments_branch_check');
-- 실패 기록은 C 승인 전에도 남길 수 있다
insert into deployments (owner_id, task_id, repo, ok, error) values ('11111111-1111-4111-8111-111111111111', 'dededede-0000-4000-8000-000000000001', 'o/r', false, 'C 승인 없음');

-- C 승인이 있으면 성공 기록 가능(승인 기록은 트리거 없이 직접 넣는다: C 규칙 자체는 90_pr_checks에서 시험)
reset role;
alter table approvals disable trigger user;
insert into approvals (owner_id, task_id, gate, decision, approved_revision) values ('11111111-1111-4111-8111-111111111111', 'dededede-0000-4000-8000-000000000001', 'C', 'approved', 1);
alter table approvals enable trigger user;
select pg_temp.as_service();
insert into deployments (owner_id, task_id, repo, from_sha, to_sha, ok) values ('11111111-1111-4111-8111-111111111111', 'dededede-0000-4000-8000-000000000001', 'o/r', 'a', 'b', true);

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select count(*) from deployments where task_id = 'dededede-0000-4000-8000-000000000001') = 2, 'owner reads deployments');
update deployments set ok = false;
select pg_temp.check((select count(*) from deployments where ok) = 1, 'owner cannot change deployments');
reset role;
\o
\echo 대화 저장·배포 기록 테스트 완료
