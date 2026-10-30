-- v0.3.7 실시간 반영: supabase_realtime 발행이 있으면 업무 표들을 넣는다(여러 번 돌려도 같음)
\set ON_ERROR_STOP on
\o /dev/null
create publication supabase_realtime;
\i supabase/migrations/0015_realtime.sql
\i supabase/migrations/0015_realtime.sql
do $$
begin
  if (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') <> 17 then
    raise exception 'realtime tables: expected 17, got %', (select count(*) from pg_publication_tables where pubname = 'supabase_realtime');
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('chat_messages', 'ai_calls')) then
    raise exception 'chat_messages·ai_calls should not be broadcast';
  end if;
end $$;
\o
\echo 실시간 반영 테스트 완료
