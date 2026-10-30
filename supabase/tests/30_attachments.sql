-- v0.2.3 첨부 규칙 시험: 요청 자료 잠금, 결과 스크린샷 추가만, 비공개 Storage 정책, 업무 삭제
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

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

select pg_temp.check((select public = false and file_size_limit = 20971520 from storage.buckets where id = 'attachments'), '비공개 버킷, 20MB 상한(0012 문서 첨부, 이미지 5MB는 표 규칙)');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
insert into tasks (id, project_id, title, type, assignee) values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '첨부 시험', 'design', 'studioA');

-- 요청 자료: 경로·형식·역할 검사
select pg_temp.expect_fail($q$insert into attachments (task_id, kind, role, file_name, mime, size_bytes, sha256, storage_path) values ('cccccccc-0000-4000-8000-000000000001', 'request', 'current', 'a.png', 'image/png', 10, repeat('a', 64), 'other/x/a.png')$q$, 'invalid storage path');
select pg_temp.expect_fail($q$insert into attachments (task_id, kind, role, file_name, mime, size_bytes, sha256, storage_path) values ('cccccccc-0000-4000-8000-000000000001', 'request', 'after', 'a.png', 'image/png', 10, repeat('a', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/a.png')$q$, 'check');
select pg_temp.expect_fail($q$insert into attachments (task_id, kind, role, file_name, mime, size_bytes, sha256, storage_path) values ('cccccccc-0000-4000-8000-000000000001', 'request', 'current', 'a.bmp', 'image/bmp', 10, repeat('a', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/a.bmp')$q$, 'check');
insert into attachments (id, task_id, kind, position, role, file_name, mime, size_bytes, sha256, storage_path) values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'request', 0, 'current', 'now.png', 'image/png', 100, repeat('a', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/' || repeat('a', 64) || '.png'),
  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 'request', 1, 'target', 'goal.png', 'image/png', 100, repeat('b', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/' || repeat('b', 64) || '.png');

-- 순서·역할·설명만 바뀐다
update attachments set position = 5, note = '버튼이 잘림', sha256 = repeat('f', 64), storage_path = 'x' where id = 'dddddddd-0000-4000-8000-000000000001';
select pg_temp.check((select position = 5 and note = '버튼이 잘림' and sha256 = repeat('a', 64) and storage_path like '11111111-%' from attachments where id = 'dddddddd-0000-4000-8000-000000000001'), '파일 정보는 바뀌지 않음');

-- Storage: 자기 업무 폴더에만 올림
insert into storage.objects (bucket_id, name) values ('attachments', '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/' || repeat('a', 64) || '.png');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values ('attachments', '22222222-2222-4222-8222-222222222222/cccccccc-0000-4000-8000-000000000001/x.png')$q$, 'row-level security');
select pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name) values ('attachments', '11111111-1111-4111-8111-111111111111/eeeeeeee-0000-4000-8000-000000000009/x.png')$q$, 'row-level security');

-- A 승인 뒤에는 요청 자료를 바꾸거나 지울 수 없다
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('cccccccc-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('cccccccc-0000-4000-8000-000000000001', 'A', 'approved', 1);
select pg_temp.expect_fail($q$update attachments set note = '늦은 수정' where id = 'dddddddd-0000-4000-8000-000000000002'$q$, 'locked after A approval');
select pg_temp.expect_fail($q$delete from attachments where id = 'dddddddd-0000-4000-8000-000000000002'$q$, 'locked after A approval');
select pg_temp.expect_fail($q$insert into attachments (task_id, kind, role, file_name, mime, size_bytes, sha256, storage_path) values ('cccccccc-0000-4000-8000-000000000001', 'request', 'error', 'e.png', 'image/png', 10, repeat('c', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/e.png')$q$, 'locked after A approval');
-- 기획서를 새 버전으로 저장하면(A 무효) 다시 바꿀 수 있다
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('cccccccc-0000-4000-8000-000000000001', 2, 'change_request', '원문', '프롬프트 수정');
delete from attachments where id = 'dddddddd-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) from attachments where kind = 'request') = 1, '새 기획서 버전에서는 요청 자료 수정 가능');

-- 결과 스크린샷: 최신 결과에만, B 전까지, 추가만
select pg_temp.expect_fail($q$insert into attachments (task_id, kind, result_revision, role, file_name, mime, size_bytes, sha256, storage_path) values ('cccccccc-0000-4000-8000-000000000001', 'result', 1, 'after', 'r.png', 'image/png', 10, repeat('d', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/r.png')$q$, 'latest result package');
insert into result_packages (task_id, revision, source, summary) values ('cccccccc-0000-4000-8000-000000000001', 1, 'manual', '결과');
insert into attachments (id, task_id, kind, result_revision, role, file_name, mime, size_bytes, sha256, storage_path) values
  ('dddddddd-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000001', 'result', 1, 'after', 'r.png', 'image/png', 10, repeat('d', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/' || repeat('d', 64) || '.png');
with u as (update attachments set note = '위조' where kind = 'result' returning 1) select pg_temp.check((select count(*) from u) = 0, '결과 스크린샷 수정 불가');
with d as (delete from attachments where kind = 'result' returning 1) select pg_temp.check((select count(*) from d) = 0, '결과 스크린샷 삭제 불가');
insert into storage.objects (bucket_id, name) values ('attachments', '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/' || repeat('d', 64) || '.png');
with d as (delete from storage.objects where name like '%' || repeat('d', 64) || '%' returning 1) select pg_temp.check((select count(*) from d) = 0, '결과 스크린샷 파일은 지울 수 없음');
with d as (delete from storage.objects where name like '%' || repeat('a', 64) || '%' returning 1) select pg_temp.check((select count(*) from d) = 1, '요청 자료 파일은 지울 수 있음');
insert into approvals (task_id, gate, decision, approved_revision) values ('cccccccc-0000-4000-8000-000000000001', 'B', 'approved', 1);
select pg_temp.expect_fail($q$insert into attachments (task_id, kind, result_revision, role, file_name, mime, size_bytes, sha256, storage_path) values ('cccccccc-0000-4000-8000-000000000001', 'result', 1, 'before', 'r2.png', 'image/png', 10, repeat('e', 64), '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000001/r2.png')$q$, 'already approved');

-- 다른 사용자
select pg_temp.as_user('22222222-2222-4222-8222-222222222222', 'other@example.invalid');
select pg_temp.check((select count(*) from attachments) = 0 and (select count(*) from storage.objects) = 0, '다른 사용자는 첨부와 파일을 볼 수 없음');

-- 업무를 지우면 첨부 기록도 함께 지워진다(A 승인·결과 기록이 있어도)
select pg_temp.as_user('11111111-1111-4111-8111-111111111111', 'owner@example.invalid');
insert into approvals (task_id, gate, decision, approved_revision) values ('cccccccc-0000-4000-8000-000000000001', 'A', 'approved', 2);
delete from tasks where id = 'cccccccc-0000-4000-8000-000000000001';
reset role;
select pg_temp.check((select count(*) from attachments where task_id = 'cccccccc-0000-4000-8000-000000000001') = 0, '업무 삭제 시 첨부 기록도 삭제');
\echo 첨부 테스트 완료
