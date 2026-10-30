-- MinLab AI Office v0.3.7: 여러 기기 실시간 반영(Supabase Realtime, 무료).
-- 업무·승인·결과·첨부·입력창 대화가 바뀌면 열려 있는 다른 기기 화면이 바로 다시 읽는다(15초 기다리지 않음).
-- Realtime도 RLS를 따른다: 로그인한 소유자는 자기 행의 변경만 받는다.
-- supabase_realtime 발행(publication)이 없는 DB(로컬 시험)에서는 아무것도 하지 않는다.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'projects', 'tasks', 'usage_runs', 'task_specs', 'approvals', 'pm_plans', 'agent_assignments',
    'result_packages', 'revision_requests', 'attachments', 'link_refs', 'clarifications',
    'image_analyses', 'pr_checks', 'deployments', 'inbox_state', 'agent_limits'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
