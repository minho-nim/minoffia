-- v0.2.14 PR CI 확인 기록과 C 승인 시험
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

create function pg_temp.as_user() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
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

-- 준비: A → 결과 → B, PR 주소
select pg_temp.as_user();
insert into tasks (id, project_id, title, type, assignee) values ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'CI 시험', 'dev', 'codex');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('a1a1a1a1-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('a1a1a1a1-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into result_packages (task_id, revision, source, summary) values ('a1a1a1a1-0000-4000-8000-000000000001', 1, 'manual', '결과');
insert into approvals (task_id, gate, decision, approved_revision) values ('a1a1a1a1-0000-4000-8000-000000000001', 'B', 'approved', 1);
update tasks set pr_url = 'https://github.com/o/r/pull/7' where id = 'a1a1a1a1-0000-4000-8000-000000000001';

-- 사용자는 확인 기록을 만들 수 없다
select pg_temp.expect_fail($q$insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, ci_state) values ('11111111-1111-4111-8111-111111111111', 'a1a1a1a1-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/7', 'closed', true, 'success')$q$, 'row-level security');

-- CI 실패, 병합 없이 닫힌 PR이면 C 불가(v0.4.5부터 열린 PR + CI 성공은 C 가능: 병합은 C 뒤 서버가 함)
select pg_temp.as_service();
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, ci_state, checked_at) values
  ('11111111-1111-4111-8111-111111111111', 'a1a1a1a1-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/7', 'open', false, 'failure', now() - interval '3 minutes');
select pg_temp.as_user();
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('a1a1a1a1-0000-4000-8000-000000000001', 'C', 'approved', 1)$q$, 'passing CI');
select pg_temp.as_service();
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, ci_state, checked_at) values
  ('11111111-1111-4111-8111-111111111111', 'a1a1a1a1-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/7', 'closed', false, 'success', now() - interval '2 minutes');
select pg_temp.as_user();
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('a1a1a1a1-0000-4000-8000-000000000001', 'C', 'approved', 1)$q$, 'passing CI');

-- 다른 PR 주소의 성공 기록은 쓰지 않는다
select pg_temp.as_service();
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, ci_state, checked_at) values
  ('11111111-1111-4111-8111-111111111111', 'a1a1a1a1-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/8', 'closed', true, 'success', now() - interval '1 minute');
select pg_temp.as_user();
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('a1a1a1a1-0000-4000-8000-000000000001', 'C', 'approved', 1)$q$, 'passing CI');

-- 최신 확인이 '성공 + 병합'이면 C 가능
select pg_temp.as_service();
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, ci_state) values
  ('11111111-1111-4111-8111-111111111111', 'a1a1a1a1-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/7', 'closed', true, 'success');
select pg_temp.as_user();
insert into approvals (task_id, gate, decision, approved_revision) values ('a1a1a1a1-0000-4000-8000-000000000001', 'C', 'approved', 1);
select pg_temp.check((select count(*) from approvals where task_id = 'a1a1a1a1-0000-4000-8000-000000000001' and gate = 'C') = 1, 'CI 성공·병합 확인 뒤 C 승인');
with u as (update pr_checks set ci_state = 'success' returning 1) select pg_temp.check((select count(*) from u) = 0, '확인 기록은 고칠 수 없음');
reset role;
\echo PR CI 확인 테스트 완료
