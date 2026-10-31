-- v0.4.20 꼬임 방지: 같은 계획의 다른 작업이 아직 진행 중이면 올리기 승인(B)을 막는다
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

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);
insert into tasks (id, owner_id, project_id, title, type, assignee) values ('e1e1e1e1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '둘이 나눠 하는 업무', 'dev', 'codex');
insert into task_specs (owner_id, task_id, revision, intent, user_original_text, final_prompt) values ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 1, 'change_request', '원문', '기획');
insert into approvals (owner_id, task_id, gate, decision, approved_revision) values ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 'A', 'approved', 1);
insert into pm_plans (owner_id, task_id, plan_revision, approved_spec_revision, source, plan) values ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 1, 1, 'manual', '{"work_items":[{"id":"W1"},{"id":"W2"}]}');
alter table agent_assignments disable trigger user;
insert into agent_assignments (owner_id, task_id, plan_revision, work_item_id, title, assignee, execution_mode, dispatch_status) values
  ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 1, 'W1', 'Codex 몫', 'codex', 'manual_handoff', 'started'),
  ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 1, 'W2', 'Claude 몫', 'claude', 'manual_handoff', 'completed');
alter table agent_assignments enable trigger user;
insert into result_packages (owner_id, task_id, revision, source, summary, diff, work_item_id) values ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 1, 'claude_session_auto', 'W2 결과', 'diff', 'W2');

select pg_temp.expect_fail($q$insert into approvals (owner_id, task_id, gate, decision, approved_revision) values ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 'B', 'approved', 1)$q$, 'still running');
select pg_temp.check(true, 'Codex(W1)가 진행 중이면 Claude(W2) 결과만으로 B 승인 안 됨');

alter table agent_assignments disable trigger user;
update agent_assignments set dispatch_status = 'completed' where task_id = 'e1e1e1e1-0000-4000-8000-000000000001' and work_item_id = 'W1';
alter table agent_assignments enable trigger user;
insert into approvals (owner_id, task_id, gate, decision, approved_revision) values ('11111111-1111-4111-8111-111111111111', 'e1e1e1e1-0000-4000-8000-000000000001', 'B', 'approved', 1);
select pg_temp.check((select count(*) from approvals where task_id = 'e1e1e1e1-0000-4000-8000-000000000001' and gate = 'B') = 1, '모든 작업이 끝나면 B 승인');
reset role;
select set_config('request.jwt.claims', '', false);
