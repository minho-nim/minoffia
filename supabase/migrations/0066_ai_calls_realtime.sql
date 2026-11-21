-- v0.7.97 소유자 "에이전트 사용량이 바로 표시가 안 됨": Gemini·Tavily·Firecrawl 사용 기록(ai_calls)도 실시간 대상에 넣는다.
-- 앱은 이 표가 바뀌면 화면 전체가 아니라 사용량만 다시 읽는다. Realtime도 RLS를 따른다(소유자는 자기 행만).
-- supabase_realtime 발행이 없는 DB(로컬 시험)에서는 아무것도 하지 않는다.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_calls') then
    alter publication supabase_realtime add table public.ai_calls;
  end if;
end $$;
