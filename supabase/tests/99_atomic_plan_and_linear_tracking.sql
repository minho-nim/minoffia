\set ON_ERROR_STOP on
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'check failed: %', label; end if; end $$;
create function pg_temp.expect_fail(q text, needle text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if position(needle in sqlerrm)=0 then raise exception 'expected %, got %',needle,sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure: %',needle;
end $$;
create function pg_temp.plan(rev integer default 1) returns jsonb language sql as $$
  select jsonb_build_object('id', gen_random_uuid(), 'task_id','b0390000-0000-4000-8000-000000000001',
    'plan_revision',rev, 'approved_spec_revision',1,'source','manual',
    'plan','{"work_items":[{"id":"W1","dependencies":[]},{"id":"W2","dependencies":[]}]}'::jsonb)
$$;
create function pg_temp.assignments() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'work_item_id','W1','assignee','codex','execution_mode','manual_handoff'),
    jsonb_build_object('id',gen_random_uuid(),'work_item_id','W2','assignee','claude','execution_mode','manual_handoff'))
$$;
insert into auth.users(id,email) values ('f0390000-0000-4000-8000-000000000001','atomic@example.invalid');
select set_config('request.jwt.claims','{"sub":"f0390000-0000-4000-8000-000000000001","role":"authenticated","email":"atomic@example.invalid"}',true);
set local role authenticated;
insert into projects(id,name,repo) values ('a0390000-0000-4000-8000-000000000001','Atomic test','owner/test');
insert into tasks(id,project_id,title,type,assignee) values ('b0390000-0000-4000-8000-000000000001','a0390000-0000-4000-8000-000000000001','Atomic test','dev','codex');
insert into task_specs(task_id,revision,intent,user_original_text,final_prompt) values ('b0390000-0000-4000-8000-000000000001',1,'change_request','test','test');
select pg_temp.expect_fail($q$select save_pm_plan(pg_temp.plan(),pg_temp.assignments())$q$,'A approval required');
insert into approvals(task_id,gate,decision,approved_revision) values ('b0390000-0000-4000-8000-000000000001','A','approved',1);
select pg_temp.expect_fail($q$select save_pm_plan(pg_temp.plan(),jsonb_build_array(pg_temp.assignments()->0))$q$, 'assignments must match');
-- 계획 INSERT 뒤 두 번째 배정 INSERT가 실패하는 실제 경로. 함수의 서브트랜잭션 전체가 롤백되어야 한다.
select pg_temp.expect_fail($q$select save_pm_plan(pg_temp.plan(),jsonb_set(pg_temp.assignments(),'{1,execution_mode}','"bad_mode"'))$q$, 'execution_mode_check');
select pg_temp.check((select count(*)=0 from pm_plans where task_id='b0390000-0000-4000-8000-000000000001'),'failed assignment rolls back plan');
select pg_temp.check((select count(*)=0 from agent_assignments where task_id='b0390000-0000-4000-8000-000000000001'),'failed assignment leaves no partial work');
select pg_temp.expect_fail($q$select save_pm_plan(pg_temp.plan(),jsonb_set(pg_temp.assignments(),'{1,work_item_id}','"W1"'))$q$, 'assignments must match');
-- 소유자가 아닌 로그인으로 RPC를 호출해도 쓸 수 없다.
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select pg_temp.expect_fail($q$select save_pm_plan(pg_temp.plan(),pg_temp.assignments())$q$,'task does not belong to owner');
select set_config('request.jwt.claims','{"sub":"f0390000-0000-4000-8000-000000000001","role":"authenticated","email":"atomic@example.invalid"}',true);
select save_pm_plan(pg_temp.plan(),pg_temp.assignments());
select pg_temp.check((select count(*)=1 from pm_plans where task_id='b0390000-0000-4000-8000-000000000001'),'plan saved once');
select pg_temp.check((select count(*)=2 and bool_and(dispatch_status='awaiting_user_execution_approval') from agent_assignments where task_id='b0390000-0000-4000-8000-000000000001'),'all work saved but not executed');
select pg_temp.expect_fail($q$select save_pm_plan(pg_temp.plan(),pg_temp.assignments())$q$,'plan revision must be 2');

-- Linear ID는 E 승인 뒤 외부 호출 전에 만들어지고 중단/확인 뒤 재시도에도 보존된다.
set local role service_role;
select pg_temp.check((select reason='not_approved' from claim_codex_linear((select id from agent_assignments where task_id='b0390000-0000-4000-8000-000000000001' and work_item_id='W1'),'f0390000-0000-4000-8000-000000000001',false)),'Linear E required');
set local role authenticated;
insert into approvals(task_id,gate,decision,approved_revision,work_item_id) values ('b0390000-0000-4000-8000-000000000001','E','approved',1,'W1');
set local role service_role;
select pg_temp.check((select ok from claim_codex_linear((select id from agent_assignments where task_id='b0390000-0000-4000-8000-000000000001' and work_item_id='W1'),'f0390000-0000-4000-8000-000000000001',false)),'Linear reserved');
create temp table saved_linear_id as select provider_execution_id from agent_assignments where task_id='b0390000-0000-4000-8000-000000000001' and work_item_id='W1';
select pg_temp.check((select provider_execution_id::uuid is not null from saved_linear_id),'issue UUID is persisted before any external request');
set local role authenticated;
-- 앱의 실제 중단 기록은 상태 문구를 user_stopped로 덮어쓴다.
update agent_assignments set dispatch_status='failed',actual_provider_status='user_stopped' where task_id='b0390000-0000-4000-8000-000000000001' and work_item_id='W1';
set local role service_role;
select pg_temp.check((select reason='not_claimable' from claim_codex_linear((select id from agent_assignments where task_id='b0390000-0000-4000-8000-000000000001' and work_item_id='W1'),'f0390000-0000-4000-8000-000000000001',false)),'explicit retry acknowledgment required');
select pg_temp.check((select ok from claim_codex_linear((select id from agent_assignments where task_id='b0390000-0000-4000-8000-000000000001' and work_item_id='W1'),'f0390000-0000-4000-8000-000000000001',true)),'acknowledged retry');
select pg_temp.check((select a.provider_execution_id=s.provider_execution_id from agent_assignments a cross join saved_linear_id s where a.task_id='b0390000-0000-4000-8000-000000000001' and a.work_item_id='W1'),'stopping cannot erase reserved Linear ID');
rollback;
\echo 'Atomic plan save and durable Linear reservation tests passed'
