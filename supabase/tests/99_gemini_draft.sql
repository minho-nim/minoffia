-- v0.4.0 Gemini 기획서 초안: planner gemini_draft와 ai_calls purpose plan을 받고, 모르는 값은 거절
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.as_user() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

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

select pg_temp.as_user();
insert into tasks (id, project_id, title, type, assignee) values ('f0f0f0f0-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Gemini 초안', 'dev', 'codex');
insert into task_specs (task_id, revision, intent, planner, user_original_text, final_prompt) values ('f0f0f0f0-0000-4000-8000-000000000001', 1, 'change_request', 'gemini_draft', '원문', '프롬프트');
select pg_temp.expect_fail($q$insert into task_specs (task_id, revision, intent, planner, user_original_text, final_prompt) values ('f0f0f0f0-0000-4000-8000-000000000001', 2, 'change_request', 'grok', '원문', 'p')$q$, 'task_specs_planner_check');

reset role;
insert into ai_calls (owner_id, provider, purpose, ok) values ('11111111-1111-4111-8111-111111111111', 'gemini', 'plan', true);
select pg_temp.expect_fail($q$insert into ai_calls (owner_id, provider, purpose, ok) values ('11111111-1111-4111-8111-111111111111', 'gemini', 'code', true)$q$, 'ai_calls_purpose_check');
\o
\echo 'Gemini 기획서 초안 테스트 완료'
