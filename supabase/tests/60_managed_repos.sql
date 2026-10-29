-- v0.2.6 AI Office가 만든 저장소 기록 시험
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

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);
set role authenticated;
select pg_temp.expect_fail($q$insert into managed_repos (owner_id, full_name) values ('11111111-1111-4111-8111-111111111111', 'me/app')$q$, 'row-level security');

select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
insert into managed_repos (owner_id, project_id, full_name) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'me/shop-app');
select pg_temp.expect_fail($q$insert into managed_repos (owner_id, full_name) values ('11111111-1111-4111-8111-111111111111', 'me/shop-app')$q$, 'duplicate');
select pg_temp.expect_fail($q$insert into managed_repos (owner_id, full_name) values ('11111111-1111-4111-8111-111111111111', 'not a repo')$q$, 'check');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, false);
set role authenticated;
select pg_temp.check((select count(*) from managed_repos) = 0, '다른 사용자는 저장소 기록을 볼 수 없음');
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);
select pg_temp.check((select count(*) from managed_repos) = 1, '소유자는 자기 기록을 읽음');
with d as (delete from managed_repos returning 1) select pg_temp.check((select count(*) from d) = 0, '저장소 기록은 지울 수 없음');
reset role;
\echo 저장소 기록 테스트 완료
