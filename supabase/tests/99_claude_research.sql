-- v0.7.11 Claude 웹 조사: 소유자는 자기 것만 읽고, 직접 넣거나 고칠 수 없다(서버만). 표 해시는 하나씩.
\set ON_ERROR_STOP on
\o /dev/null
reset role;
insert into auth.users (id) values ('77777777-7777-4777-8777-777777777777'), ('88888888-8888-4888-8888-888888888888') on conflict do nothing;
insert into claude_research (owner_id, question, token_hash, expires_at) values ('77777777-7777-4777-8777-777777777777', '오늘 환율', 'h1', now() + interval '2 hours');
do $$ begin
  begin
    insert into claude_research (owner_id, question, token_hash, expires_at) values ('77777777-7777-4777-8777-777777777777', '중복 표', 'h1', now());
    raise exception '표 해시는 하나씩';
  exception when unique_violation then null;
  end;
  begin
    insert into claude_research (owner_id, question, token_hash, expires_at, status) values ('77777777-7777-4777-8777-777777777777', '상태', 'h2', now(), 'weird');
    raise exception '상태는 셋 중 하나';
  exception when check_violation then null;
  end;
end $$;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from claude_research) <> 1 then raise exception '내 조사 1개가 보여야 함'; end if;
  begin
    insert into claude_research (owner_id, question, token_hash, expires_at) values ('77777777-7777-4777-8777-777777777777', '직접', 'h3', now());
    raise exception '앱은 직접 넣을 수 없음';
  exception when insufficient_privilege then null;
  end;
  update claude_research set status = 'done', answer = '가짜';
  if (select status from claude_research limit 1) <> 'pending' then raise exception '앱은 고칠 수 없어야 함'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from claude_research) <> 0 then raise exception '남의 조사가 보이면 안 됨'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
\o
\echo Claude 웹 조사 테스트 완료
