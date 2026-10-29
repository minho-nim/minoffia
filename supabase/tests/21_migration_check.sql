\set ON_ERROR_STOP on
\o /dev/null
do $$ begin
  if (select count(*) from tasks) <> 2 or (select count(*) from usage_runs) <> 1 or (select count(*) from projects) <> 1 then
    raise exception 'v0.1 data lost';
  end if;
  if (select stage from tasks where title = 'README 정리') <> 'completed' then raise exception 'done → completed 실패'; end if;
  if (select stage from tasks where title = '설계 테스트') <> 'received' then raise exception 'blocked → received 실패'; end if;
  if (select user_original_text from tasks where title = 'README 정리') <> E'README 정리\n\ncmd 기준' then raise exception '원문 보존 실패'; end if;
  if (select status from tasks where title = '설계 테스트') <> 'blocked' then raise exception '기존 status 변경됨'; end if;
  raise notice 'ok: v0.1 업무·사용량·프로젝트 보존, 원문 채움, 단계 변환';
end $$;
