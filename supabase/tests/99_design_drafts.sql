-- v0.7.13 Gemini 시안: 시안은 서버만 넣고 소유자는 읽기만, 고르기는 내 시안만 추가(고치기·지우기 없음).
\set ON_ERROR_STOP on
\o /dev/null
reset role;
insert into auth.users (id) values ('99999999-9999-4999-8999-999999999991'), ('99999999-9999-4999-8999-999999999992') on conflict do nothing;
insert into projects (id, owner_id, name) values ('99999999-0000-4000-8000-0000000000d1', '99999999-9999-4999-8999-999999999991', '시안 시험');
insert into tasks (id, owner_id, project_id, title, type, assignee) values ('99999999-0000-4000-8000-0000000000d2', '99999999-9999-4999-8999-999999999991', '99999999-0000-4000-8000-0000000000d1', '시안', 'dev', 'codex');
insert into design_drafts (id, owner_id, task_id, spec_revision, who, svg) values
  ('99999999-0000-4000-8000-0000000000a1', '99999999-9999-4999-8999-999999999991', '99999999-0000-4000-8000-0000000000d2', 1, 'A', '<svg/>'),
  ('99999999-0000-4000-8000-0000000000b1', '99999999-9999-4999-8999-999999999991', '99999999-0000-4000-8000-0000000000d2', 1, 'B', '<svg/>');
do $$ begin
  begin
    insert into design_drafts (owner_id, task_id, spec_revision, who, svg) values ('99999999-9999-4999-8999-999999999991', '99999999-0000-4000-8000-0000000000d2', 1, 'A', '<svg/>');
    raise exception '같은 기획서 버전에 A는 하나만';
  exception when unique_violation then null;
  end;
  begin
    insert into design_drafts (owner_id, task_id, spec_revision, who, svg) values ('99999999-9999-4999-8999-999999999992', '99999999-0000-4000-8000-0000000000d2', 2, 'A', '<svg/>');
    raise exception '남의 업무에는 못 넣음';
  exception when raise_exception then null;
  end;
end $$;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999991","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from design_drafts) <> 2 then raise exception '내 시안 2개가 보여야 함'; end if;
  begin
    insert into design_drafts (owner_id, task_id, spec_revision, who, svg) values ('99999999-9999-4999-8999-999999999991', '99999999-0000-4000-8000-0000000000d2', 3, 'A', '<svg/>');
    raise exception '앱은 시안을 직접 넣을 수 없음';
  exception when insufficient_privilege then null;
  end;
  insert into design_picks (task_id, spec_revision, draft_id) values ('99999999-0000-4000-8000-0000000000d2', 1, '99999999-0000-4000-8000-0000000000b1');
  begin
    insert into design_picks (task_id, spec_revision, draft_id) values ('99999999-0000-4000-8000-0000000000d2', 2, '99999999-0000-4000-8000-0000000000b1');
    raise exception '다른 기획서 버전으로는 못 고름';
  exception when insufficient_privilege then null;
  end;
  update design_picks set draft_id = '99999999-0000-4000-8000-0000000000a1';
  delete from design_picks;
  if (select draft_id from design_picks limit 1) <> '99999999-0000-4000-8000-0000000000b1' then raise exception '고른 기록은 고치거나 지울 수 없음'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999992","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from design_drafts) + (select count(*) from design_picks) <> 0 then raise exception '남의 시안이 보이면 안 됨'; end if;
  begin
    insert into design_picks (task_id, spec_revision, draft_id) values ('99999999-0000-4000-8000-0000000000d2', 1, '99999999-0000-4000-8000-0000000000a1');
    raise exception '남의 시안은 못 고름';
  exception when insufficient_privilege or raise_exception then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
\o
\echo Gemini 시안 테스트 완료
