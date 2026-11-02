-- v0.4.64 결과 평가 기록: 소유자는 자기 것만 읽고, 직접 넣거나 고칠 수 없다(서버만 넣음). 같은 결과 버전은 한 번만.
\set ON_ERROR_STOP on
\o /dev/null
reset role;
insert into auth.users (id) values ('55555555-5555-4555-8555-555555555555'), ('66666666-6666-4666-8666-666666666666') on conflict do nothing;
insert into projects (id, owner_id, name) values ('bbbbbbbb-0000-4000-8000-0000000000b1', '55555555-5555-4555-8555-555555555555', '평가 시험');
insert into tasks (id, owner_id, project_id, title, type, assignee) values ('bbbbbbbb-0000-4000-8000-0000000000b2', '55555555-5555-4555-8555-555555555555', 'bbbbbbbb-0000-4000-8000-0000000000b1', '평가', 'dev', 'claude');
insert into result_reviews (owner_id, task_id, result_revision, verdict, total) values ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-0000-4000-8000-0000000000b2', 1, 'pass', 88);
do $$ begin
  begin
    insert into result_reviews (owner_id, task_id, result_revision, verdict) values ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-0000-4000-8000-0000000000b2', 1, 'redo');
    raise exception '같은 결과 버전은 한 번만';
  exception when unique_violation then null;
  end;
  begin
    insert into result_reviews (owner_id, task_id, result_revision, verdict) values ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-0000-4000-8000-0000000000b2', 2, 'great');
    raise exception '판정은 셋 중 하나';
  exception when check_violation then null;
  end;
end $$;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from result_reviews) <> 1 then raise exception '내 평가 1개가 보여야 함'; end if;
  begin
    insert into result_reviews (owner_id, task_id, result_revision, verdict) values ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-0000-4000-8000-0000000000b2', 3, 'pass');
    raise exception '앱은 직접 넣을 수 없음';
  exception when insufficient_privilege then null;
  end;
  update result_reviews set verdict = 'redo';
  if (select verdict from result_reviews limit 1) <> 'pass' then raise exception '고칠 수 없어야 함'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from result_reviews) <> 0 then raise exception '남의 평가가 보이면 안 됨'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
\o
\echo 결과 평가 기록 테스트 완료
