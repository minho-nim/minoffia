\set ON_ERROR_STOP on
-- v0.6.16 한 결과 버전에는 수정 요청이 하나만
begin;
do $$ begin
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='revision_requests_once' and indexdef ilike '%unique%(task_id, result_revision)%') then
    raise exception 'revision_requests_once unique index missing';
  end if;
end $$;
rollback;
