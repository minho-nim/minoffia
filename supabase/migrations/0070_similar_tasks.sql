-- v0.8.9 소유자 "2는 1단계": 기획서를 쓰기 전에 같은 프로젝트의 비슷한 지난 업무를 찾는다(모델 0, 0원).
-- 글자 조각(trigram) 유사도로 제목 + 원문 앞부분을 비교한다. 본인 업무만(호출하는 사람의 RLS 그대로, security invoker).
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to authenticated, service_role;

create or replace function public.similar_tasks(p_task uuid, p_limit integer default 3)
returns table (id uuid, title text, score real)
language sql stable security invoker set search_path = public, extensions as $$
  with me as (
    select t.id, t.project_id, t.created_at, left(t.title || ' ' || coalesce(t.user_original_text, ''), 300) as body
    from tasks t where t.id = p_task
  )
  select t.id, t.title, extensions.similarity(left(t.title || ' ' || coalesce(t.user_original_text, ''), 300), me.body) as score
  from tasks t, me
  where t.project_id = me.project_id and t.id <> me.id and t.created_at < me.created_at
    and extensions.similarity(left(t.title || ' ' || coalesce(t.user_original_text, ''), 300), me.body) >= 0.12
  order by score desc, t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 3), 10));
$$;
revoke all on function public.similar_tasks(uuid, integer) from public, anon;
grant execute on function public.similar_tasks(uuid, integer) to authenticated, service_role;
