-- v0.5.2 Codex Linear 예약(claim_codex_linear) 시험
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
insert into tasks (id, project_id, title, type, assignee) values ('e6e6e6e6-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Codex Linear', 'dev', 'codex');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('e6e6e6e6-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('e6e6e6e6-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('e6e6e6e6-0000-4000-8000-000000000001', 1, 1, 'manual',
  '{"work_items":[{"id":"W1","dependencies":[]},{"id":"W2","dependencies":[]}]}');
insert into agent_assignments (id, task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status) values
  ('e5e5e5e5-0000-4000-8000-000000000001', 'e6e6e6e6-0000-4000-8000-000000000001', 1, 'W1', 'codex', 'codex_cloud', 'awaiting_user_execution_approval'),
  ('e5e5e5e5-0000-4000-8000-000000000002', 'e6e6e6e6-0000-4000-8000-000000000001', 1, 'W2', 'claude', 'manual_handoff', 'awaiting_user_execution_approval');

select pg_temp.expect_fail($q$select * from claim_codex_linear('e5e5e5e5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false)$q$, 'permission denied');

select pg_temp.as_service();
select pg_temp.check((select reason from claim_codex_linear('e5e5e5e5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false)) = 'not_approved', 'E 전 거절');
select pg_temp.check((select reason from claim_codex_linear('e5e5e5e5-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', false)) = 'not_codex', 'Codex 작업만');

select pg_temp.as_user();
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('e6e6e6e6-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1');
update agent_assignments set dispatch_status = 'ready' where id = 'e5e5e5e5-0000-4000-8000-000000000001';

select pg_temp.as_service();
select pg_temp.check((select reason from claim_codex_linear('e5e5e5e5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false)) = 'claimed', 'E 뒤 한 번 맡김');
select pg_temp.check((select reason from claim_codex_linear('e5e5e5e5-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false)) = 'not_claimable', '두 번 맡기지 않음');
select pg_temp.check((select count(*) from usage_runs where agent = 'codex' and task_id = 'e6e6e6e6-0000-4000-8000-000000000001') = 1, '사용 기록 1건');

-- v0.5.3 웹훅 서버는 알림 줄을 넣을 수 있고, 사용자는 못 넣는다(0036)
select push_enqueue('11111111-1111-4111-8111-111111111111', 'e6e6e6e6-0000-4000-8000-000000000001', 'blocked', 'Codex가 시작하지 못했어요');
select pg_temp.check((select count(*) from push_outbox where task_id = 'e6e6e6e6-0000-4000-8000-000000000001' and kind = 'blocked') = 1, '서버가 알림 줄 넣음');
select pg_temp.as_user();
select pg_temp.expect_fail($q$select push_enqueue('11111111-1111-4111-8111-111111111111', 'e6e6e6e6-0000-4000-8000-000000000001', 'result', 'x')$q$, 'permission denied');

-- v0.5.20 작은 일 바로 배정·Gemini 대신 분배(0037)
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt, size_hint) values ('e6e6e6e6-0000-4000-8000-000000000001', 2, 'change_request', '원문', '프롬프트', '{"difficulty":2,"single_task":true,"needs_design":false}');
insert into approvals (task_id, gate, decision, approved_revision) values ('e6e6e6e6-0000-4000-8000-000000000001', 'A', 'approved', 2);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('e6e6e6e6-0000-4000-8000-000000000001', 2, 2, 'rule_small', '{"work_items":[]}');
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('e6e6e6e6-0000-4000-8000-000000000001', 3, 2, 'gemini_fallback', '{"work_items":[]}');
select pg_temp.expect_fail($q$insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('e6e6e6e6-0000-4000-8000-000000000001', 4, 2, 'grok', '{}')$q$, 'pm_plans_source_check');
select pg_temp.as_service();
insert into ai_calls (owner_id, provider, purpose, ok) values ('11111111-1111-4111-8111-111111111111', 'gemini', 'pm', true);

reset role;
\o
\echo 'Codex Linear 예약 테스트 완료'
