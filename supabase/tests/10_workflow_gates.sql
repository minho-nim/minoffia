-- v0.2.1 승인 게이트·RLS·중복 방지 시험. 실패해야 하는 동작은 expect_fail로 확인한다.
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

create function pg_temp.as_user(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', email)::text, false);
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

insert into auth.users values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.invalid');

-- 소유자 U1 -----------------------------------------------------------------
select pg_temp.as_user('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
insert into projects (id, name, repo) values ('aaaaaaaa-0000-4000-8000-000000000001', 'P', 'minho-nim/MinLab-AI-Office');
insert into tasks (id, project_id, title, type, assignee) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '로그인 화면 개선', 'planning', 'claude');

select pg_temp.check((select stage from tasks) = 'received', '새 업무는 received');

-- A: 기획서 없이는 승인 불가
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'A', 'approved', 1)$q$, 'A must approve the latest spec');

-- 단순 질문 기획서는 개발 승인 불가
insert into task_specs (task_id, revision, intent, user_original_text, answer) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 1, 'question', '이거 어떨까?', '설명만 드립니다.');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'A', 'approved', 1)$q$, 'question/ambiguous');

-- 기획서 버전은 건너뛸 수 없다
select pg_temp.expect_fail($q$insert into task_specs (task_id, revision, intent, user_original_text) values ('bbbbbbbb-0000-4000-8000-000000000001', 3, 'change_request', 'x')$q$, 'spec revision must be 2');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 2, 'change_request', '로그인 버튼 키워줘', '로그인 버튼을 48px로');

-- 옛 버전 승인 불가, 최신 승인 1회만
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'A', 'approved', 1)$q$, 'latest spec');
insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'A', 'approved', 2);
select pg_temp.check((select actor from approvals where gate = 'A') = 'owner@example.invalid', '승인자 이메일은 서버가 JWT에서 기록');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'A', 'approved', 2)$q$, 'approvals_once');

-- PM 계획: A 승인된 최신 기획서에만
select pg_temp.expect_fail($q$insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('bbbbbbbb-0000-4000-8000-000000000001', 1, 1, 'manual', '{}')$q$, 'latest spec revision');
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 1, 2, 'routine_session_manual_import', '{"work_items":[{"id":"W1"}]}');
insert into agent_assignments (task_id, plan_revision, work_item_id, title, assignee, execution_mode, dispatch_status) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 1, 'W1', '버튼 크기', 'codex', 'manual_handoff', 'awaiting_user_execution_approval');

-- 배정 완료 ≠ 실행: E 없이 started 기록 불가, 서버 확인 상태 위조 불가
select pg_temp.expect_fail($q$update agent_assignments set dispatch_status = 'started', status_source = 'user_reported' where work_item_id = 'W1'$q$, 'E approval required');
select pg_temp.expect_fail($q$update agent_assignments set status_source = 'server_verified' where work_item_id = 'W1'$q$, 'only the server');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('bbbbbbbb-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W9')$q$, 'work item of the latest plan');
insert into approvals (task_id, gate, decision, approved_revision, work_item_id, scope) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1', '{"assignee":"codex","mode":"manual_handoff"}');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('bbbbbbbb-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1')$q$, 'approvals_once');
update agent_assignments set dispatch_status = 'started', status_source = 'user_reported', provider_task_url = 'https://example.invalid/task' where work_item_id = 'W1';
select pg_temp.check((select dispatch_status from agent_assignments) = 'started', 'E 뒤에는 사용자 보고로 시작 기록 가능');
update agent_assignments set assignee = 'claude' where work_item_id = 'W1';
select pg_temp.check((select assignee from agent_assignments) = 'codex', '배정된 AI는 사용자가 바꿀 수 없음');

-- 기획서가 바뀌면 옛 승인으로 진행 불가
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 3, 'change_request', '로그인 버튼 키워줘(수정)', '48px + 색상 유지');
select pg_temp.expect_fail($q$insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('bbbbbbbb-0000-4000-8000-000000000001', 2, 3, 'manual', '{}')$q$, 'A approval required');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('bbbbbbbb-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1')$q$, 'plan is stale');

-- 결과 → B → C 순서
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'B', 'approved', 1)$q$, 'latest result package');
insert into result_packages (task_id, revision, source, summary, diff) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 1, 'codex_cloud_manual', '버튼 크기 변경', 'diff --git a/x b/x');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'C', 'approved', 1)$q$, 'C requires B');
insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'B', 'approved', 1);
insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'C', 'approved', 1);
insert into result_packages (task_id, revision, source, summary) values ('bbbbbbbb-0000-4000-8000-000000000001', 2, 'manual', '추가 수정');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'C', 'approved', 2)$q$, 'C requires B');

-- 감사 기록은 수정·삭제 불가(정책 없음 → 0행)
with d as (delete from approvals returning 1) select pg_temp.check((select count(*) from d) = 0, '승인 기록 삭제 불가');
with u as (update task_specs set final_prompt = '위조' returning 1) select pg_temp.check((select count(*) from u) = 0, '기획서 수정 불가');

-- 클라이언트는 PM 전송 기록을 바꿀 수 없다
update tasks set dispatch_spec_revision = 99, dispatch_state = 'none';
select pg_temp.check((select dispatch_spec_revision is null and dispatch_state = 'none' from tasks), '전송 기록 위조 무시');

-- 다른 사용자 U2 --------------------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222', 'other@example.invalid');
select pg_temp.check((select count(*) from approvals) = 0 and (select count(*) from task_specs) = 0 and (select count(*) from result_packages) = 0, '다른 사용자는 승인·기획서·결과를 볼 수 없음');
select pg_temp.expect_fail($q$insert into approvals (owner_id, task_id, gate, decision, approved_revision) values ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-000000000001', 'B', 'approved', 2)$q$, 'task does not belong to owner');

-- PM 전송 예약(서버) ----------------------------------------------------------
select pg_temp.as_service();
select pg_temp.check((select reason from claim_claude_dispatch('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 2, 3)) = 'not_approved', '최신 기획서(3)가 A 미승인이면 PM 전송 불가');
select pg_temp.check((select reason from claim_claude_dispatch('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 2, 2)) = 'not_approved', '옛 버전(2)으로 PM 전송 불가');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
insert into approvals (task_id, gate, decision, approved_revision) values ('bbbbbbbb-0000-4000-8000-000000000001', 'A', 'approved', 3);
select pg_temp.as_service();
select pg_temp.check((select reason from claim_claude_dispatch('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 2, 3)) = 'claimed', 'A 승인된 최신 버전은 한 번 전송');
select pg_temp.check((select reason from claim_claude_dispatch('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 2, 3)) = 'not_claimable', '같은 버전 중복 전송 불가');
select pg_temp.check((select stage = 'dispatching' and dispatch_spec_revision = 3 from tasks), '전송 중 단계 기록');
reset role;
\echo 승인 게이트 테스트 완료
