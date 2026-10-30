-- v0.3.5 Prototype First(시안 먼저) 시험
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

create function pg_temp.proto(task uuid, rev integer) returns void language plpgsql as $$
begin
  insert into attachments (task_id, kind, plan_revision, role, file_name, mime, size_bytes, sha256, storage_path)
  values (task, 'prototype', rev, 'prototype', 'proto.zip', 'application/zip', 1000, md5(random()::text) || md5(random()::text),
          '11111111-1111-4111-8111-111111111111/' || task || '/proto.zip');
end $$;

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
set role authenticated;
-- 앞 시험에서 시작 상태로 남은 작업 정리(동시 실행 상한)
update agent_assignments set dispatch_status = 'completed' where dispatch_status in ('starting', 'started');

-- 시안 먼저 계획: W1 시안(gemini) → W2 개발(codex)
insert into tasks (id, project_id, title, type, assignee) values ('9a9a9a9a-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '새 앱 시안', 'prototype', 'studioA');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('9a9a9a9a-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('9a9a9a9a-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('9a9a9a9a-0000-4000-8000-000000000001', 1, 1, 'manual',
  '{"development_mode":"prototype_first","work_items":[{"id":"W1","dependencies":[]},{"id":"W2","dependencies":["W1"]}]}');
insert into agent_assignments (task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status) values
  ('9a9a9a9a-0000-4000-8000-000000000001', 1, 'W1', 'gemini', 'manual_handoff', 'awaiting_user_execution_approval'),
  ('9a9a9a9a-0000-4000-8000-000000000001', 1, 'W2', 'codex', 'manual_handoff', 'awaiting_user_execution_approval');

-- 시안 작업은 바로 E, Codex 작업은 P 전에는 E 불가
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('9a9a9a9a-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W1');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('9a9a9a9a-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W2')$q$, 'approve the prototype (P)');

-- 시안 없이 P 불가, 옛 계획 버전 P 불가
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('9a9a9a9a-0000-4000-8000-000000000001', 'P', 'approved', 1)$q$, 'requires an uploaded prototype');
select pg_temp.expect_fail($q$select pg_temp.proto('9a9a9a9a-0000-4000-8000-000000000001', 2)$q$, 'latest plan');
select pg_temp.expect_fail($q$insert into attachments (task_id, kind, role, file_name, mime, size_bytes, sha256, storage_path) values ('9a9a9a9a-0000-4000-8000-000000000001', 'prototype', 'prototype', 'a.zip', 'application/zip', 10, repeat('a', 64), '11111111-1111-4111-8111-111111111111/9a9a9a9a-0000-4000-8000-000000000001/a.zip')$q$, 'latest plan');

-- 시안 올리기 → 설명 고치기·지우기(P 전) → 다시 올리고 P → Codex E
select pg_temp.proto('9a9a9a9a-0000-4000-8000-000000000001', 1);
update attachments set note = 'AI Studio 시안 1차' where kind = 'prototype' and task_id = '9a9a9a9a-0000-4000-8000-000000000001';
select pg_temp.check((select note from attachments where kind = 'prototype' and task_id = '9a9a9a9a-0000-4000-8000-000000000001') = 'AI Studio 시안 1차', '시안 설명 수정');
delete from attachments where kind = 'prototype' and task_id = '9a9a9a9a-0000-4000-8000-000000000001';
select pg_temp.proto('9a9a9a9a-0000-4000-8000-000000000001', 1);
insert into approvals (task_id, gate, decision, approved_revision) values ('9a9a9a9a-0000-4000-8000-000000000001', 'P', 'approved', 1);
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('9a9a9a9a-0000-4000-8000-000000000001', 'E', 'approved', 1, 'W2');

-- P 뒤에는 시안 잠김
select pg_temp.expect_fail($q$select pg_temp.proto('9a9a9a9a-0000-4000-8000-000000000001', 1)$q$, 'locked after P approval');
select pg_temp.expect_fail($q$update attachments set note = '늦은 수정' where kind = 'prototype' and task_id = '9a9a9a9a-0000-4000-8000-000000000001'$q$, 'locked after P approval');
select pg_temp.expect_fail($q$delete from attachments where kind = 'prototype' and task_id = '9a9a9a9a-0000-4000-8000-000000000001'$q$, 'locked after P approval');

-- 바로 개발(direct) 계획: 시안·P 없음, Codex E 바로 가능
insert into tasks (id, project_id, title, type, assignee) values ('9a9a9a9a-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', '버그 수정', 'dev', 'codex');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('9a9a9a9a-0000-4000-8000-000000000002', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('9a9a9a9a-0000-4000-8000-000000000002', 'A', 'approved', 1);
insert into pm_plans (task_id, plan_revision, approved_spec_revision, source, plan) values ('9a9a9a9a-0000-4000-8000-000000000002', 1, 1, 'manual', '{"work_items":[{"id":"W1","dependencies":[]}]}');
insert into agent_assignments (task_id, plan_revision, work_item_id, assignee, execution_mode, dispatch_status) values
  ('9a9a9a9a-0000-4000-8000-000000000002', 1, 'W1', 'codex', 'manual_handoff', 'awaiting_user_execution_approval');
select pg_temp.expect_fail($q$select pg_temp.proto('9a9a9a9a-0000-4000-8000-000000000002', 1)$q$, 'not prototype_first');
select pg_temp.expect_fail($q$insert into approvals (task_id, gate, decision, approved_revision) values ('9a9a9a9a-0000-4000-8000-000000000002', 'P', 'approved', 1)$q$, 'only for prototype_first');
insert into approvals (task_id, gate, decision, approved_revision, work_item_id) values ('9a9a9a9a-0000-4000-8000-000000000002', 'E', 'approved', 1, 'W1');

reset role;
\o
\echo 시안 먼저(Prototype First) 테스트 완료
