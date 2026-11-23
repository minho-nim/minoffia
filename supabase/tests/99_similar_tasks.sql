-- v0.8.9 비슷한 지난 업무: 같은 프로젝트·먼저 만든 것만, 남의 업무는 안 보임
\set ON_ERROR_STOP on
\o /dev/null
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', 'o@example.invalid')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;
insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'o@example.invalid'), ('22222222-2222-4222-8222-222222222222', 'p@example.invalid') on conflict do nothing;
insert into projects (id, owner_id, name) values
  ('c0700000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '내 것'),
  ('c0700000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '남의 것');
insert into tasks (id, owner_id, project_id, title, user_original_text, created_at, type, assignee) values
  ('c0700000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'c0700000-0000-4000-8000-000000000001', '휴대폰 화면 가로 넘침 고치기', '설정 탭이 휴대폰에서 가로로 넘쳐요', now() - interval '3 day', 'planning', 'claude'),
  ('c0700000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', 'c0700000-0000-4000-8000-000000000001', '로그인 버튼 색', '버튼을 주황으로', now() - interval '2 day', 'planning', 'claude'),
  ('c0700000-0000-4000-8000-0000000000a3', '11111111-1111-4111-8111-111111111111', 'c0700000-0000-4000-8000-000000000001', '휴대폰 가로 넘침 다시', '업무 탭이 휴대폰에서 가로로 넘쳐요', now(), 'planning', 'claude'),
  ('c0700000-0000-4000-8000-0000000000b1', '22222222-2222-4222-8222-222222222222', 'c0700000-0000-4000-8000-000000000002', '휴대폰 화면 가로 넘침', '남의 업무', now() - interval '5 day', 'planning', 'claude');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select array_agg(id::text) from similar_tasks('c0700000-0000-4000-8000-0000000000a3', 3)) = array['c0700000-0000-4000-8000-0000000000a1'], 'similar own earlier task only');
select pg_temp.check((select count(*) from similar_tasks('c0700000-0000-4000-8000-0000000000a1', 3)) = 0, 'no later tasks');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from similar_tasks('c0700000-0000-4000-8000-0000000000a3', 3)) = 0, 'other owner sees nothing');
reset role;
delete from tasks where id::text like 'c0700000-%';
delete from projects where id::text like 'c0700000-%';
