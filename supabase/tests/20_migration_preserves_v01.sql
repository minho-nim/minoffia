-- 0001·0002만 적용된 DB에 v0.1 업무를 넣은 뒤 0003을 적용해 보존되는지 확인한다.
\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users values ('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
insert into projects (id, owner_id, name, repo) values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'P', 'minho-nim/MinLab-AI-Office');
insert into tasks (id, owner_id, project_id, title, description, type, assignee, status) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '설계 테스트', '', 'planning', 'claude', 'blocked'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'README 정리', 'cmd 기준', 'planning', 'claude', 'done');
insert into usage_runs (owner_id, agent, task_id, kind) values ('11111111-1111-4111-8111-111111111111', 'claude', 'bbbbbbbb-0000-4000-8000-000000000002', 'cloud');
