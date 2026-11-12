-- v0.6.70 스킬 목록 저장: 본인 행만 보고 쓴다
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into skill_cache (files) values ('[{"name":"a"}]') on conflict (owner_id) do update set files = excluded.files, updated_at = now();
insert into skill_cache (map) values ('{"p1":{"a":"same"}}') on conflict (owner_id) do update set map = excluded.map, updated_at = now();
select pg_temp.check((select count(*) from skill_cache) = 1, 'one row per owner');
select pg_temp.check((select files->0->>'name' from skill_cache) = 'a' and (select map->'p1'->>'a' from skill_cache) = 'same', 'files and map kept separately');

update skill_cache set mcp = '{"p1":["context7"]}';
select pg_temp.check((select mcp->'p1'->>0 from skill_cache) = 'context7', 'mcp names kept');

select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from skill_cache) = 0, 'other owner sees nothing');
update skill_cache set files = '[]';
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select files->0->>'name' from skill_cache) = 'a', 'other owner cannot overwrite');

reset role;
