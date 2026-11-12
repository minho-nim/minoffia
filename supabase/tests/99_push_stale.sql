-- v0.6.80 오래 걸리는 개발 알림: 시작한 지 기준 시간이 지나도 소식이 없으면 한 번만 알린다
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
set role authenticated;
insert into tasks (id, project_id, title, type, assignee) values ('5a5a5a5a-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '느린 개발', 'dev', 'codex');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('5a5a5a5a-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('5a5a5a5a-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('5a5a5a5a-0000-4000-8000-000000000001', 1, 1, 'manual', '{"work_items":[{"id":"W1","dependencies":[]}]}');
insert into agent_assignments (task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status) values ('5a5a5a5a-0000-4000-8000-000000000001', 1, 'W1', 'codex', 'manual_handoff', 'ready');
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('5a5a5a5a-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1');
update agent_assignments set dispatch_status = 'started', status_source = 'user_reported' where task_id = '5a5a5a5a-0000-4000-8000-000000000001';
reset role;

select pg_temp.check(public.push_stale_work() = 0, '막 시작한 작업은 알리지 않음');
update agent_assignments set started_at = now() - interval '130 minutes' where task_id = '5a5a5a5a-0000-4000-8000-000000000001';
select pg_temp.check(public.push_stale_work() = 1, 'Codex 120분 넘게 소식 없으면 알림');
select pg_temp.check((select title from push_outbox where kind = 'stale') like 'Codex W1: 13_분째 소식 없음%', '알림 제목은 누가·몇 분');
select pg_temp.check(public.push_stale_work() = 0, '같은 시작은 한 번만');
