-- v0.3.2 문서 첨부 시험
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

create function pg_temp.att(mime text, role text, size integer, kind text default 'request', rev integer default null) returns void language plpgsql as $$
begin
  insert into attachments (task_id, kind, result_revision, role, file_name, mime, size_bytes, sha256, storage_path)
  values ('d0c0d0c0-0000-4000-8000-000000000001', kind, rev, role, 'f', mime, size, md5(random()::text) || md5(random()::text),
          '11111111-1111-4111-8111-111111111111/d0c0d0c0-0000-4000-8000-000000000001/f');
end $$;

select pg_temp.check((select 'application/pdf' = any(allowed_mime_types) and 'application/zip' = any(allowed_mime_types) and not ('text/html' = any(allowed_mime_types)) from storage.buckets where id = 'attachments'), '버킷 형식: 문서 추가, HTML 없음');

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
set role authenticated;
insert into tasks (id, project_id, title, type, assignee) values ('d0c0d0c0-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '문서 첨부 시험', 'dev', 'codex');

-- 문서는 요청 자료(역할 document)로 20MB까지
select pg_temp.att('application/pdf', 'document', 20971520);
select pg_temp.att('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document', 1000);
select pg_temp.att('text/markdown', 'document', 10);
select pg_temp.att('application/zip', 'document', 1000);
select pg_temp.expect_fail($q$select pg_temp.att('application/pdf', 'document', 20971521)$q$, 'attachments_size_bytes_check');
select pg_temp.expect_fail($q$select pg_temp.att('text/html', 'document', 10)$q$, 'attachments_mime_check');
select pg_temp.expect_fail($q$select pg_temp.att('image/svg+xml', 'current', 10)$q$, 'attachments_mime_check');
-- 문서에 화면 역할, 이미지에 document 역할은 안 됨
select pg_temp.expect_fail($q$select pg_temp.att('application/pdf', 'current', 10)$q$, 'attachments_check1');
select pg_temp.expect_fail($q$select pg_temp.att('image/png', 'document', 10)$q$, 'attachments_check1');
-- 이미지는 여전히 5MB
select pg_temp.att('image/png', 'current', 5242880);
select pg_temp.expect_fail($q$select pg_temp.att('image/png', 'current', 5242881)$q$, 'attachments_size_bytes_check');

-- 결과 스크린샷은 이미지만
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('d0c0d0c0-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
reset role;
alter table approvals disable trigger user;
insert into approvals (owner_id, task_id, gate, decision, approved_revision) values ('11111111-1111-4111-8111-111111111111', 'd0c0d0c0-0000-4000-8000-000000000001', 'A', 'approved', 1);
alter table approvals enable trigger user;
alter table result_packages disable trigger user;
insert into result_packages (owner_id, task_id, revision, source, summary) values ('11111111-1111-4111-8111-111111111111', 'd0c0d0c0-0000-4000-8000-000000000001', 1, 'manual', '결과');
alter table result_packages enable trigger user;
set role authenticated;
select pg_temp.expect_fail($q$select pg_temp.att('application/pdf', 'after', 10, 'result', 1)$q$, 'attachments_check1');
select pg_temp.att('image/png', 'after', 10, 'result', 1);

reset role;
\o
\echo 문서 첨부 테스트 완료
