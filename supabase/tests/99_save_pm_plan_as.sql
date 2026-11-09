\set ON_ERROR_STOP on
-- v0.6.11 서버에서 계획 바로 받기: save_pm_plan_as는 서버(service_role)만, 소유자 업무에만, 계획·작업을 한 번에 저장한다.
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
create function pg_temp.plan() returns jsonb language sql as $$
  select jsonb_build_object('id', gen_random_uuid(), 'task_id','b0440000-0000-4000-8000-000000000001',
    'plan_revision',1, 'approved_spec_revision',1,'source','routine_session_auto',
    'plan','{"work_items":[{"id":"W1","dependencies":[]}]}'::jsonb)
$$;
create function pg_temp.assignments() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'work_item_id','W1','assignee','gemini','execution_mode','gemini_actions'))
$$;
insert into auth.users(id,email) values ('f0440000-0000-4000-8000-000000000001','planas@example.invalid');
insert into projects(id,owner_id,name,repo) values ('a0440000-0000-4000-8000-000000000001','f0440000-0000-4000-8000-000000000001','Plan as','owner/test');
insert into tasks(id,owner_id,project_id,title,type,assignee) values ('b0440000-0000-4000-8000-000000000001','f0440000-0000-4000-8000-000000000001','a0440000-0000-4000-8000-000000000001','Plan as','dev','codex');
insert into task_specs(owner_id,task_id,revision,intent,user_original_text,final_prompt) values ('f0440000-0000-4000-8000-000000000001','b0440000-0000-4000-8000-000000000001',1,'change_request','t','t');

-- 로그인 사용자는 부를 수 없다
select set_config('request.jwt.claims','{"sub":"f0440000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.expect_fail($q$select save_pm_plan_as('f0440000-0000-4000-8000-000000000001',pg_temp.plan(),pg_temp.assignments())$q$,'permission denied');
reset role;

set local role service_role;
-- A 승인 전에는 계획을 저장할 수 없다(기존 문지기 그대로)
select pg_temp.expect_fail($q$select save_pm_plan_as('f0440000-0000-4000-8000-000000000001',pg_temp.plan(),pg_temp.assignments())$q$,'A approval required');
reset role;
insert into approvals(owner_id,task_id,gate,decision,approved_revision) values ('f0440000-0000-4000-8000-000000000001','b0440000-0000-4000-8000-000000000001','A','approved',1);
set local role service_role;
-- 다른 소유자로는 저장할 수 없다
select pg_temp.expect_fail($q$select save_pm_plan_as('22222222-2222-4222-8222-222222222222',pg_temp.plan(),pg_temp.assignments())$q$,'task does not belong to owner');
select save_pm_plan_as('f0440000-0000-4000-8000-000000000001',pg_temp.plan(),pg_temp.assignments());
reset role;
select pg_temp.check((select count(*)=1 from pm_plans where task_id='b0440000-0000-4000-8000-000000000001' and owner_id='f0440000-0000-4000-8000-000000000001'),'plan saved with owner');
select pg_temp.check((select count(*)=1 from agent_assignments where task_id='b0440000-0000-4000-8000-000000000001' and owner_id='f0440000-0000-4000-8000-000000000001' and execution_mode='gemini_actions' and dispatch_status='awaiting_user_execution_approval'),'assignment saved');
rollback;
