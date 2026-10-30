-- v0.2.11 동시 개발 작업 1개 시험
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

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
set role authenticated;
-- 앞 시험에서 시작 상태로 남은 작업은 끝난 것으로 정리
update agent_assignments set dispatch_status = 'completed' where dispatch_status in ('starting', 'started');

insert into tasks (id, project_id, title, type, assignee) values
  ('efefefef-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '동시 실행 시험', 'dev', 'codex');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('efefefef-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('efefefef-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('efefefef-0000-4000-8000-000000000001', 1, 1, 'manual',
  '{"work_items":[{"id":"W1","dependencies":[]},{"id":"W2","dependencies":[]},{"id":"W3","dependencies":["W1"]}]}');
insert into agent_assignments (task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status) values
  ('efefefef-0000-4000-8000-000000000001', 1, 'W1', 'codex', 'manual_handoff', 'ready'),
  ('efefefef-0000-4000-8000-000000000001', 1, 'W2', 'claude', 'manual_handoff', 'ready'),
  ('efefefef-0000-4000-8000-000000000001', 1, 'W3', 'claude', 'manual_handoff', 'ready'),
  ('efefefef-0000-4000-8000-000000000001', 1, 'W4', 'codex', 'manual_handoff', 'ready');
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values
  ('efefefef-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1'),
  ('efefefef-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W2'),
  ('efefefef-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W3'),
  ('efefefef-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W4');

-- 기본 상한: Codex 3 → W1·W4 동시 가능, Claude 3
update agent_assignments set dispatch_status = 'started', status_source = 'user_reported' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id in ('W1', 'W2', 'W4');
select pg_temp.check((select count(*) from agent_assignments where dispatch_status = 'started') = 3, '기본 상한에서 Codex 2개·Claude 1개 동시 진행');
-- 상한을 1로 낮추면 같은 AI의 새 작업은 막힘(이미 돌고 있는 것은 그대로)
insert into agent_limits (assignee, max_running) values ('claude', 1);
select pg_temp.expect_fail($q$insert into agent_limits (assignee, max_running) values ('codex', 9)$q$, 'check');
-- 순서: W3는 W1이 끝나야 시작
update agent_assignments set dispatch_status = 'failed', actual_provider_status = 'user_stopped' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W2';
select pg_temp.expect_fail($q$update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W3'$q$, 'dependency not finished: W1');
update agent_assignments set dispatch_status = 'completed' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W1';
update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W3';
-- Claude 상한 1: W2 재시작은 막힘
select pg_temp.expect_fail($q$update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W2'$q$, 'concurrent execution limit');
-- 시작된 작업의 다른 값(주소) 수정은 된다
update agent_assignments set provider_task_url = 'https://example.invalid/t' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W3';
-- 상한을 다시 2로 올리면 시작 가능
update agent_limits set max_running = 2 where assignee = 'claude';
update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W2';
select pg_temp.check((select count(*) from agent_assignments where assignee = 'claude' and dispatch_status = 'started') = 2, '상한을 올리면 같은 AI 작업을 더 시작');
-- 다른 사용자는 내 상한을 못 봄
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, false);
select pg_temp.check((select count(*) from agent_limits) = 0, '다른 사용자는 상한 설정을 볼 수 없음');
reset role;
\echo 동시 실행 테스트 완료
