-- v0.4.94 Claude 채점 제출표(0033): 결과 버전마다 한 번, 결과 버전 필수
\set ON_ERROR_STOP on
reset role;
insert into auth.users (id, email) values ('e9e9e9e9-0000-4000-8000-000000000001', 'review@example.invalid') on conflict do nothing;
insert into projects (id, owner_id, name) values ('e9e9e9e9-0000-4000-8000-000000000002', 'e9e9e9e9-0000-4000-8000-000000000001', '채점');
insert into tasks (id, owner_id, project_id, title, type, assignee) values ('e9e9e9e9-0000-4000-8000-000000000003', 'e9e9e9e9-0000-4000-8000-000000000001', 'e9e9e9e9-0000-4000-8000-000000000002', '채점 업무', 'planning', 'codex');
insert into plan_submit_tokens (owner_id, task_id, spec_revision, token_hash, expires_at, kind, result_revision)
  values ('e9e9e9e9-0000-4000-8000-000000000001', 'e9e9e9e9-0000-4000-8000-000000000003', 1, md5('rv-a') || md5('rv2-a'), now() + interval '6 hours', 'review', 1);
do $$
begin
  begin
    insert into plan_submit_tokens (owner_id, task_id, spec_revision, token_hash, expires_at, kind, result_revision)
      values ('e9e9e9e9-0000-4000-8000-000000000001', 'e9e9e9e9-0000-4000-8000-000000000003', 1, md5('rv-b') || md5('rv2-b'), now() + interval '6 hours', 'review', 1);
    raise exception 'FAIL: 같은 결과 버전 채점 두 번';
  exception when unique_violation then null;
  end;
  begin
    insert into plan_submit_tokens (owner_id, task_id, spec_revision, token_hash, expires_at, kind)
      values ('e9e9e9e9-0000-4000-8000-000000000001', 'e9e9e9e9-0000-4000-8000-000000000003', 1, md5('rv-c') || md5('rv2-c'), now() + interval '6 hours', 'review');
    raise exception 'FAIL: 결과 버전 없는 채점표';
  exception when check_violation then null;
  end;
end $$;
insert into plan_submit_tokens (owner_id, task_id, spec_revision, token_hash, expires_at, kind, result_revision)
  values ('e9e9e9e9-0000-4000-8000-000000000001', 'e9e9e9e9-0000-4000-8000-000000000003', 1, md5('rv-d') || md5('rv2-d'), now() + interval '6 hours', 'review', 2);
\echo Claude 채점 제출표 테스트 완료
