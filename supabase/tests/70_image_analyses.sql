-- v0.2.9 이미지 분석 기록 시험
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

-- 준비: 소유자 업무와 요청 이미지
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
set role authenticated;
insert into tasks (id, project_id, title, type, assignee) values
  ('abababab-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '분석 시험', 'design', 'studioA');
insert into attachments (id, task_id, kind, role, file_name, mime, size_bytes, sha256, storage_path) values
  ('cdcdcdcd-0000-4000-8000-000000000001', 'abababab-0000-4000-8000-000000000001', 'request', 'current', 'now.png', 'image/png', 10, repeat('1', 64), '11111111-1111-4111-8111-111111111111/abababab-0000-4000-8000-000000000001/' || repeat('1', 64) || '.png');

-- 사용자는 직접 기록할 수 없다
select pg_temp.expect_fail($q$insert into image_analyses (owner_id, attachment_id, task_id, sha256, analysis) values ('11111111-1111-4111-8111-111111111111', 'cdcdcdcd-0000-4000-8000-000000000001', 'abababab-0000-4000-8000-000000000001', repeat('1', 64), '{}')$q$, 'row-level security');

select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
insert into image_analyses (owner_id, attachment_id, task_id, sha256, model, key_slot, analysis) values
  ('11111111-1111-4111-8111-111111111111', 'cdcdcdcd-0000-4000-8000-000000000001', 'abababab-0000-4000-8000-000000000001', repeat('1', 64), 'm', 1, '{"observations":["버튼"]}');
select pg_temp.expect_fail($q$insert into image_analyses (owner_id, attachment_id, task_id, sha256, analysis) values ('11111111-1111-4111-8111-111111111111', 'cdcdcdcd-0000-4000-8000-000000000001', 'abababab-0000-4000-8000-000000000001', repeat('1', 64), '{}')$q$, 'duplicate');
select pg_temp.expect_fail($q$insert into image_analyses (owner_id, attachment_id, task_id, sha256, analysis) values ('22222222-2222-4222-8222-222222222222', 'cdcdcdcd-0000-4000-8000-000000000001', 'abababab-0000-4000-8000-000000000001', repeat('1', 64), '{}')$q$, 'request attachment of the owner');
insert into ai_calls (owner_id, provider, purpose, ok) values ('11111111-1111-4111-8111-111111111111', 'gemini', 'image', true);
select pg_temp.expect_fail($q$insert into ai_calls (owner_id, provider, purpose, ok) values ('11111111-1111-4111-8111-111111111111', 'gemini', 'video', true)$q$, 'check');

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
set role authenticated;
select pg_temp.check((select count(*) from image_analyses) = 1, '소유자는 분석을 읽음');
with u as (update image_analyses set analysis = '{}' returning 1) select pg_temp.check((select count(*) from u) = 0, '분석은 고칠 수 없음');

-- A 승인 뒤에는 새 분석을 붙이지 않는다
insert into attachments (id, task_id, kind, role, file_name, mime, size_bytes, sha256, storage_path) values
  ('cdcdcdcd-0000-4000-8000-000000000002', 'abababab-0000-4000-8000-000000000001', 'request', 'target', 'goal.png', 'image/png', 10, repeat('2', 64), '11111111-1111-4111-8111-111111111111/abababab-0000-4000-8000-000000000001/' || repeat('2', 64) || '.png');
insert into task_specs (task_id, revision, intent, user_original_text, final_prompt) values ('abababab-0000-4000-8000-000000000001', 1, 'change_request', '원문', '프롬프트');
insert into approvals (task_id, gate, decision, approved_revision) values ('abababab-0000-4000-8000-000000000001', 'A', 'approved', 1);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
select pg_temp.expect_fail($q$insert into image_analyses (owner_id, attachment_id, task_id, sha256, analysis) values ('11111111-1111-4111-8111-111111111111', 'cdcdcdcd-0000-4000-8000-000000000002', 'abababab-0000-4000-8000-000000000001', repeat('2', 64), '{}')$q$, 'locked after A approval');

-- 업무를 지우면 함께 지워진다
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);
set role authenticated;
delete from tasks where id = 'abababab-0000-4000-8000-000000000001';
reset role;
select pg_temp.check((select count(*) from image_analyses where task_id = 'abababab-0000-4000-8000-000000000001') = 0, '업무 삭제 시 분석도 삭제');
\echo 이미지 분석 테스트 완료
