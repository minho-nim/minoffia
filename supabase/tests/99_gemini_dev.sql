-- v0.4.82 Gemini 개발 예약(claim_gemini_dev) 시험
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
insert into tasks (id, project_id, title, type, assignee) values ('e7e7e7e7-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Gemini 개발', 'dev', 'studioA');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('e7e7e7e7-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('e7e7e7e7-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('e7e7e7e7-0000-4000-8000-000000000001', 1, 1, 'manual',
  '{"work_items":[{"id":"W1","dependencies":[]},{"id":"W2","dependencies":[]}]}');
insert into agent_assignments (id, task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status) values
  ('e8e8e8e8-0000-4000-8000-000000000001', 'e7e7e7e7-0000-4000-8000-000000000001', 1, 'W1', 'gemini', 'gemini_actions', 'awaiting_user_execution_approval'),
  ('e8e8e8e8-0000-4000-8000-000000000002', 'e7e7e7e7-0000-4000-8000-000000000001', 1, 'W2', 'gemini', 'manual_handoff', 'awaiting_user_execution_approval');

-- 사용자는 예약 함수를 부를 수 없다
select pg_temp.expect_fail($q$select * from claim_gemini_dev('e8e8e8e8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 10, 'studioA')$q$, 'permission denied');
-- 실행 방식 gemini_actions는 받는다
select pg_temp.check((select execution_mode from agent_assignments where id = 'e8e8e8e8-0000-4000-8000-000000000001') = 'gemini_actions', 'gemini_actions 저장');

select pg_temp.as_service();
select pg_temp.check((select reason from claim_gemini_dev('e8e8e8e8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 10, 'studioA')) = 'not_approved', 'E 전 거절');
select pg_temp.check((select reason from claim_gemini_dev('e8e8e8e8-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', false, 10, 'studioA')) = 'not_gemini_dev', '견본(수동 인계) 작업 거절');
select pg_temp.check((select reason from claim_gemini_dev('e8e8e8e8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 10, 'claude')) = 'bad_agent', '키 캐릭터는 studioA·studioB만');

select pg_temp.as_user();
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('e7e7e7e7-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1');
update agent_assignments set dispatch_status = 'ready' where id = 'e8e8e8e8-0000-4000-8000-000000000001';

select pg_temp.as_service();
select pg_temp.check((select reason from claim_gemini_dev('e8e8e8e8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 0, 'studioB')) = 'daily_cap', '상한 거절');
create temp table before_g as select count(*) n from usage_runs where agent = 'studioB' and kind = 'cloud';
select pg_temp.check((select ok from claim_gemini_dev('e8e8e8e8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 10, 'studioB')), '예약 성공');
select pg_temp.check((select dispatch_status from agent_assignments where id = 'e8e8e8e8-0000-4000-8000-000000000001') = 'starting', '시작 중');
select pg_temp.check((select count(*) from usage_runs where agent = 'studioB' and kind = 'cloud') = (select n from before_g) + 1, '키 B 실행 1회 기록');
select pg_temp.check((select reason from claim_gemini_dev('e8e8e8e8-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 10, 'studioA')) = 'not_claimable', '중복 예약 거절');

-- Gemini 워크플로 결과 출처
select pg_temp.check(exists (select 1 from pg_constraint where conname = 'result_packages_source_check' and pg_get_constraintdef(oid) like '%gemini_actions_auto%'), '결과 출처 gemini_actions_auto');

reset role;
\o
\echo Gemini 개발 예약 테스트 완료
