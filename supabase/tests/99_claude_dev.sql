-- v0.3.8 Claude 보조 개발 예약(claim_claude_dev) 시험
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

select pg_temp.as_user();
update agent_assignments set dispatch_status = 'completed' where dispatch_status in ('starting', 'started');
insert into tasks (id, project_id, title, type, assignee) values ('c1c1c1c1-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '보조 개발', 'dev', 'claude');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('c1c1c1c1-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('c1c1c1c1-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('c1c1c1c1-0000-4000-8000-000000000001', 1, 1, 'manual',
  '{"work_items":[{"id":"W1","dependencies":[]},{"id":"W2","dependencies":["W1"]},{"id":"W3","dependencies":[]}]}');
insert into agent_assignments (id, task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status) values
  ('c2c2c2c2-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 1, 'W1', 'claude', 'manual_handoff', 'awaiting_user_execution_approval'),
  ('c2c2c2c2-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000001', 1, 'W2', 'claude', 'manual_handoff', 'awaiting_user_execution_approval'),
  ('c2c2c2c2-0000-4000-8000-000000000003', 'c1c1c1c1-0000-4000-8000-000000000001', 1, 'W3', 'codex', 'manual_handoff', 'awaiting_user_execution_approval');

-- 사용자는 예약 함수를 부를 수 없다
select pg_temp.expect_fail($q$select * from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 20)$q$, 'permission denied');

select pg_temp.as_service();
-- E 승인 전, Codex 작업은 거절
select pg_temp.check((select reason from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 20)) = 'not_approved', 'E 전 거절');
select pg_temp.check((select reason from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', false, 20)) = 'not_claude', 'Codex 작업 거절');

select pg_temp.as_user();
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values
  ('c1c1c1c1-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1'),
  ('c1c1c1c1-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W2');
update agent_assignments set dispatch_status = 'ready' where task_id = 'c1c1c1c1-0000-4000-8000-000000000001' and assignee = 'claude';

select pg_temp.as_service();
-- 하루 상한
select pg_temp.check((select reason from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 0)) = 'daily_cap', '상한 거절');
-- 예약: 시작 중 + 실행 1회 기록
create temp table before_runs as select count(*) n from usage_runs where agent = 'claude' and kind = 'cloud';
select pg_temp.check((select ok from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 20)), '예약 성공');
select pg_temp.check((select dispatch_status from agent_assignments where id = 'c2c2c2c2-0000-4000-8000-000000000001') = 'starting', '시작 중');
select pg_temp.check((select count(*) from usage_runs where agent = 'claude' and kind = 'cloud') = (select n from before_runs) + 1, '실행 1회 기록');
-- 같은 작업 다시 예약 불가, 앞 작업이 안 끝난 W2는 가드가 막음
select pg_temp.check((select reason from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 20)) = 'not_claimable', '중복 예약 거절');
select pg_temp.expect_fail($q$select * from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', false, 20)$q$, 'dependency not finished');
-- 실패한 작업은 확인 뒤 다시 예약
update agent_assignments set dispatch_status = 'failed' where id = 'c2c2c2c2-0000-4000-8000-000000000001';
select pg_temp.check((select reason from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 20)) = 'not_claimable', '실패 후 확인 없이 거절');
select pg_temp.check((select ok from claim_claude_dev('c2c2c2c2-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', true, 20)), '확인 후 다시 예약');

reset role;
\o
\echo Claude 보조 개발 예약 테스트 완료
