-- v0.2.4 링크 읽기 결과·확인 질문 시험
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

create function pg_temp.as_user(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', email)::text, false);
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

select pg_temp.as_user('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
insert into tasks (id, project_id, title, type, assignee) values
  ('ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '링크 시험', 'research', 'studioA');

-- 링크: 사용자는 직접 기록할 수 없다(서버만)
select pg_temp.expect_fail($q$insert into link_refs (owner_id, task_id, url, kind, status) values ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', 'https://example.com', 'webpage', 'ok')$q$, 'row-level security');

select pg_temp.as_service();
insert into link_refs (id, owner_id, task_id, url, kind, status, title, excerpt) values
  ('99999999-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', 'https://example.com', 'webpage', 'ok', 'Example', '본문'),
  ('99999999-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', 'http://10.0.0.1/', 'other', 'blocked', '', '');
select pg_temp.expect_fail($q$insert into link_refs (owner_id, task_id, url, kind, status) values ('22222222-2222-4222-8222-222222222222', 'ffffffff-0000-4000-8000-000000000001', 'https://example.com', 'webpage', 'ok')$q$, 'task does not belong');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
select pg_temp.check((select count(*) from link_refs where task_id = 'ffffffff-0000-4000-8000-000000000001') = 2, '소유자는 링크 결과를 읽음');
with u as (update link_refs set excerpt = '위조' returning 1) select pg_temp.check((select count(*) from u) = 0, '링크 결과는 고칠 수 없음');
delete from link_refs where id = '99999999-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) from link_refs where task_id = 'ffffffff-0000-4000-8000-000000000001') = 1, 'A 전에는 링크를 지울 수 있음');

-- 확인 질문·답변: 최신 기획서 버전에만
select pg_temp.expect_fail($q$insert into clarifications (task_id, spec_revision, question, answer) values ('ffffffff-0000-4000-8000-000000000001', 1, '대상 화면은?', '로그인')$q$, 'latest spec revision');
insert into clarifications (task_id, spec_revision, question, answer) values ('ffffffff-0000-4000-8000-000000000001', 0, '대상 화면은?', '로그인 화면');
select pg_temp.expect_fail($q$insert into clarifications (task_id, spec_revision, question, answer) values ('ffffffff-0000-4000-8000-000000000001', 0, '빈 답', '')$q$, 'check');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('ffffffff-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into clarifications (task_id, spec_revision, question, answer) values ('ffffffff-0000-4000-8000-000000000001', 1, '색은?', '그대로');
with u as (update clarifications set answer = '위조' returning 1) select pg_temp.check((select count(*) from u) = 0, '확인 질문 기록은 고칠 수 없음');
with d as (delete from clarifications returning 1) select pg_temp.check((select count(*) from d) = 0, '확인 질문 기록은 지울 수 없음');

-- A 승인 뒤 링크 잠금
insert into approvals (task_id, gate, decision, approved_revision) values ('ffffffff-0000-4000-8000-000000000001', 'A', 'approved', 1);
select pg_temp.expect_fail($q$delete from link_refs where id = '99999999-0000-4000-8000-000000000001'$q$, 'locked after A approval');
select pg_temp.as_service();
select pg_temp.expect_fail($q$insert into link_refs (owner_id, task_id, url, kind, status) values ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000001', 'https://example.org', 'webpage', 'ok')$q$, 'locked after A approval');

-- 다른 사용자
select pg_temp.as_user('22222222-2222-4222-8222-222222222222', 'other@example.invalid');
select pg_temp.check((select count(*) from link_refs) = 0 and (select count(*) from clarifications) = 0, '다른 사용자는 링크·확인 질문을 볼 수 없음');
select pg_temp.expect_fail($q$insert into clarifications (owner_id, task_id, spec_revision, question, answer) values ('22222222-2222-4222-8222-222222222222', 'ffffffff-0000-4000-8000-000000000001', 1, 'q', 'a')$q$, 'task does not belong');

-- 업무 삭제 시 함께 지워진다
select pg_temp.as_user('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
delete from tasks where id = 'ffffffff-0000-4000-8000-000000000001';
reset role;
select pg_temp.check((select count(*) from link_refs where task_id = 'ffffffff-0000-4000-8000-000000000001') = 0 and (select count(*) from clarifications where task_id = 'ffffffff-0000-4000-8000-000000000001') = 0, '업무 삭제 시 링크·확인 질문도 삭제');
\echo 링크·확인 질문 테스트 완료
