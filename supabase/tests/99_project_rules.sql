-- v0.4.57 프로젝트에서 지켜야 할 것·미리보기 주소: 소유자는 자기 프로젝트 규칙만 보고, 직접 넣을 때는 source owner만, 지울 수 있다.
\set ON_ERROR_STOP on
\o /dev/null
reset role;
insert into auth.users (id) values ('33333333-3333-4333-8333-333333333333'), ('44444444-4444-4444-8444-444444444444') on conflict do nothing;
insert into projects (id, owner_id, name, repo) values ('aaaaaaaa-0000-4000-8000-00000000aa01', '33333333-3333-4333-8333-333333333333', '규칙 시험', 'o/r');
-- 서버(service role)는 AI가 적은 규칙을 넣는다
insert into project_rules (owner_id, project_id, rule, source) values ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-0000-4000-8000-00000000aa01', '모바일 400px에서 가로 넘침 없게', 'plan');
do $$ begin
  begin
    insert into project_rules (owner_id, project_id, rule, source) values ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-0000-4000-8000-00000000aa01', '모바일 400px에서 가로 넘침 없게', 'result');
    raise exception '같은 규칙은 한 번만';
  exception when unique_violation then null;
  end;
  begin
    update projects set preview_host = 'https://x.pages.dev' where id = 'aaaaaaaa-0000-4000-8000-00000000aa01';
    raise exception '미리보기 주소는 호스트만';
  exception when check_violation then null;
  end;
end $$;
update projects set preview_host = 'minlab-ai-office.pages.dev' where id = 'aaaaaaaa-0000-4000-8000-00000000aa01';

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', false);
insert into project_rules (project_id, rule, source) values ('aaaaaaaa-0000-4000-8000-00000000aa01', '결제 기능 넣지 않기', 'owner');
do $$ begin
  if (select count(*) from project_rules) <> 2 then raise exception '규칙이 2개여야 함'; end if;
  begin
    insert into project_rules (project_id, rule, source) values ('aaaaaaaa-0000-4000-8000-00000000aa01', 'AI인 척 넣기', 'plan');
    raise exception '앱에서는 source owner만 넣어야 함';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from project_rules) <> 0 then raise exception '다른 사람 규칙이 보이면 안 됨'; end if;
  begin
    insert into project_rules (project_id, rule, source) values ('aaaaaaaa-0000-4000-8000-00000000aa01', '남의 프로젝트', 'owner');
    raise exception '남의 프로젝트에 넣으면 안 됨';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', false);
delete from project_rules where rule = '결제 기능 넣지 않기';
do $$ begin
  if (select count(*) from project_rules) <> 1 then raise exception '지운 뒤 1개여야 함'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
\o
\echo 프로젝트 규칙 테스트 완료
