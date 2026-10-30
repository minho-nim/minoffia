-- v0.3.9 개발 전에 지운 업무의 대화 기록은 지우고, E 승인 뒤 업무의 기록은 남긴다
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
insert into tasks (id, project_id, title, type, assignee) values
  ('d0d0d0d0-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '개발 전 삭제', 'dev', 'codex'),
  ('d0d0d0d0-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', '개발 후 삭제', 'dev', 'codex');
insert into chat_messages (role, text, project_id, task_id) values
  ('me', '앞 질문', 'aaaaaaaa-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000001'),
  ('gemini', '앞 답', 'aaaaaaaa-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000001'),
  ('me', '개발한 요청', 'aaaaaaaa-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000002');

-- E 승인은 트리거 없이 직접 넣는다(E 규칙 자체는 10_workflow_gates에서 시험)
reset role;
alter table approvals disable trigger user;
insert into approvals (owner_id, task_id, gate, decision, approved_revision, work_item_id)
  values ('11111111-1111-4111-8111-111111111111', 'd0d0d0d0-0000-4000-8000-000000000002', 'E', 'approved', 1, 'W1');
alter table approvals enable trigger user;

select pg_temp.as_user();
delete from tasks where id in ('d0d0d0d0-0000-4000-8000-000000000001', 'd0d0d0d0-0000-4000-8000-000000000002');
select pg_temp.check((select count(*) from chat_messages where text in ('앞 질문', '앞 답')) = 0, '개발 전 삭제 업무의 대화는 지움');
select pg_temp.check((select count(*) from chat_messages where text = '개발한 요청' and task_id is null) = 1, 'E 승인 뒤 업무의 대화는 남김');
reset role;
