-- AI 휴가(0026): 소유자만 자기 휴가 행을 보고 넣고 지운다. 미니엉·CI는 휴가 불가.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
insert into agent_leave (agent) values ('codex');
do $$ begin
  if (select count(*) from agent_leave) <> 1 then raise exception '휴가 행이 1개여야 함'; end if;
end $$;
do $$ begin
  begin
    insert into agent_leave (agent) values ('mina');
    raise exception '미니엉 휴가가 막혀야 함';
  exception when check_violation then null;
  end;
end $$;
-- v0.7.9: Exa도 휴가를 줄 수 있다
insert into agent_leave (agent) values ('exa');
delete from agent_leave where agent = 'exa';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', false);
do $$ begin
  if (select count(*) from agent_leave) <> 0 then raise exception '다른 사람 휴가가 보이면 안 됨'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);
delete from agent_leave where agent = 'codex';
do $$ begin
  if (select count(*) from agent_leave) <> 0 then raise exception '근무로 돌리면 행이 없어야 함'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '', false);
