-- v0.3.9 처음 배정이 Codex인 업무도 A 승인 뒤 Claude PM에 보낼 수 있다(0018)
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.as_user() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

select pg_temp.as_user();
insert into tasks (id, project_id, title, type, assignee) values ('e0e0e0e0-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Codex로 접수된 업무', 'dev', 'codex');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('e0e0e0e0-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('e0e0e0e0-0000-4000-8000-000000000001', 'A', 'approved', 1);

reset role;
select pg_temp.check((select reason from claim_claude_dispatch('e0e0e0e0-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', false, 99, 1)) = 'claimed', '처음 배정이 Codex여도 PM 전송');
select pg_temp.check((select assignee = 'codex' and stage = 'dispatching' from tasks where id = 'e0e0e0e0-0000-4000-8000-000000000001'), '처음 배정은 그대로, 단계만 전송 중');
