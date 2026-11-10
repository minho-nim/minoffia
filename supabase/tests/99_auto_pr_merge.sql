-- v0.4.5 (나) 올리기 승인 뒤 Claude PR 예약은 결과 버전마다 한 번, (다) 열린 PR + CI 성공이면 배포 승인 가능
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.as_user() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
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
insert into tasks (id, owner_id, project_id, title, type, assignee, pr_url) values
  ('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '자동 PR', 'dev', 'claude', 'https://github.com/o/r/pull/9');
alter table result_packages disable trigger user;
alter table approvals disable trigger user;
insert into result_packages (owner_id, task_id, revision, plan_revision, work_item_id, source, summary, diff)
  values ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000001', 1, 1, 'W1', 'claude_session_auto', '요약', 'diff --git a/x b/x');

-- 올리기 승인 전에는 예약 불가
select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 99)) = 'not_approved', 'B 전 PR 예약 불가');
insert into approvals (owner_id, task_id, gate, decision, approved_revision) values ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000001', 'B', 'approved', 1);
alter table result_packages enable trigger user;
alter table approvals enable trigger user;

select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 99)) = 'claimed', 'B 뒤 한 번 예약');
select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', true, 99)) = 'already', '같은 결과로 두 번 예약 불가');
update pr_dispatches set status = 'failed' where task_id = 'd5d5d5d5-0000-4000-8000-000000000001';
select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 99)) = 'already', '실패해도 확인 없이 재시도 불가');
select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', true, 99)) = 'claimed', '실패 확인 뒤 재시도');
select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 0)) = 'already', '상한보다 중복 검사가 먼저');

-- v0.6.19: Codex(Linear)가 직접 보낸 결과도 B 뒤 Claude가 PR을 연다. 사람이 붙여 넣은 Codex 결과는 아니다.
insert into tasks (id, owner_id, project_id, title, type, assignee) values
  ('d5d5d5d5-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'Codex PR', 'dev', 'codex'),
  ('d5d5d5d5-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'Codex 수동', 'dev', 'codex');
alter table result_packages disable trigger user;
alter table approvals disable trigger user;
insert into result_packages (owner_id, task_id, revision, plan_revision, work_item_id, source, summary, diff) values
  ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000002', 1, 1, 'W1', 'codex_linear_auto', '요약', 'diff --git a/x b/x'),
  ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000003', 1, 1, 'W1', 'codex_cloud_manual', '요약', 'diff --git a/x b/x');
insert into approvals (owner_id, task_id, gate, decision, approved_revision) values
  ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000002', 'B', 'approved', 1),
  ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000003', 'B', 'approved', 1);
alter table result_packages enable trigger user;
alter table approvals enable trigger user;
select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', false, 99)) = 'claimed', 'Codex 자동 결과는 Claude가 PR');
select pg_temp.check((select reason from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', false, 99)) = 'not_claude', 'Codex 수동 결과는 그대로');

select pg_temp.as_user();
select pg_temp.expect_fail($q$select * from claim_claude_pr('d5d5d5d5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 99)$q$, 'permission denied');
select pg_temp.expect_fail($q$insert into pr_dispatches (owner_id, task_id, result_revision) values ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000001', 2)$q$, 'row-level security');

-- (다) 열린 PR + CI 성공이면 배포 승인 가능
reset role;
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, ci_state) values
  ('11111111-1111-4111-8111-111111111111', 'd5d5d5d5-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/9', 'open', false, 'success');
select pg_temp.as_user();
insert into approvals (task_id, gate, decision, approved_revision) values ('d5d5d5d5-0000-4000-8000-000000000001', 'C', 'approved', 1);
select pg_temp.check((select count(*) from approvals where task_id = 'd5d5d5d5-0000-4000-8000-000000000001' and gate = 'C') = 1, '열린 PR + CI 성공 → 배포 승인');
reset role;
\o
\echo '자동 PR·병합 테스트 완료'
