-- v0.7.41 LLM 위키: 주인만 읽고, 앱(로그인 사용자)은 쓰지 못한다(서버 service role만 씀)
\set ON_ERROR_STOP on
\o /dev/null
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

insert into project_wiki (project_id, owner_id, body) values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '## 이 앱은\n시험');
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);
set role authenticated;
select pg_temp.check((select count(*) from project_wiki) = 1, '주인은 자기 위키를 읽는다');
do $$ begin
  begin
    insert into project_wiki (project_id, owner_id, body) values ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'x');
    raise exception '앱이 위키를 쓰면 안 된다';
  exception when insufficient_privilege or unique_violation then null;
  end;
end $$;
update project_wiki set body = '덮어쓰기';
select pg_temp.check((select body from project_wiki) <> '덮어쓰기', '앱은 위키를 고치지 못한다');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, false);
set role authenticated;
select pg_temp.check((select count(*) from project_wiki) = 0, '남의 위키는 안 보인다');
reset role;
delete from project_wiki;
