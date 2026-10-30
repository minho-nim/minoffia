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

-- 다른 AI끼리는 동시에
update agent_assignments set dispatch_status = 'started', status_source = 'user_reported' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W1';
update agent_assignments set dispatch_status = 'started', status_source = 'user_reported' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W2';
select pg_temp.check((select count(*) from agent_assignments where dispatch_status = 'started') = 2, 'Codex·Claude 동시 진행 가능');
-- 같은 AI(Codex)의 두 번째 작업은 막힘
select pg_temp.expect_fail($q$update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W4'$q$, 'concurrent execution limit');
-- 시작된 작업의 다른 값(주소) 수정은 된다
update agent_assignments set provider_task_url = 'https://example.invalid/t' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W1';
-- W3는 W1이 끝나야 시작(Claude는 W2를 중단해 비워도 순서 때문에 막힘)
update agent_assignments set dispatch_status = 'failed', actual_provider_status = 'user_stopped' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W2';
select pg_temp.expect_fail($q$update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W3'$q$, 'dependency not finished: W1');
update agent_assignments set dispatch_status = 'completed' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W1';
update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W3';
select pg_temp.check((select dispatch_status from agent_assignments where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W3') = 'started', '앞 작업이 끝나면 시작');
-- Codex가 비었으니 W4 시작 가능
update agent_assignments set dispatch_status = 'started' where task_id = 'efefefef-0000-4000-8000-000000000001' and work_item_id = 'W4';
select pg_temp.check((select count(*) from agent_assignments where dispatch_status = 'started') = 2, '완료 뒤 같은 AI 다음 작업 시작');
reset role;
\echo 동시 실행 테스트 완료
