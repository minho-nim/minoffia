-- v0.3.9 개발 전(E 승인 없음)에 지운 업무는 개발일지용 대화 기록도 함께 지운다(소유자 결정 2026-10-30).
-- E 승인이 한 번이라도 있었던 업무는 지금처럼 기록을 남긴다(task_id만 비움, on delete set null).
-- 지우는 사람 권한으로 돈다(RLS: 본인 기록만 지울 수 있음).
create or replace function public.tasks_drop_predev_chat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from approvals a where a.task_id = old.id and a.gate = 'E' and a.decision = 'approved'
  ) then
    delete from chat_messages where task_id = old.id and owner_id = old.owner_id;
  end if;
  return old;
end;
$$;

revoke execute on function public.tasks_drop_predev_chat() from public, anon, authenticated;

drop trigger if exists tasks_drop_predev_chat on public.tasks;
create trigger tasks_drop_predev_chat before delete on public.tasks
  for each row execute function public.tasks_drop_predev_chat();
