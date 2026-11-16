-- v0.7.35 소유자 "대화 모두 알람 와야지": 대화에 단계 알림이 뜨는 일은 휴대폰 알림도 보낸다(앱을 닫아 둬도).
-- 지금까지는 기획서·확인 질문·계획·결과·막힘만. 더하는 것: 평가 끝(결과 승인 차례), PR 검사 통과(배포 승인 차례)·실패,
-- 배포 끝·실패, 시안 도착, Claude 조사 답. 사장님이 직접 누른 승인은 알리지 않는다. AI 호출 없음.
-- 같은 업무·같은 종류는 push_enqueue가 2분 안에 한 번만 넣는다.

alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('spec', 'question', 'plan', 'prototype', 'result', 'blocked', 'test', 'briefing', 'stale', 'review', 'pr', 'deploy', 'draft', 'answer'));

create or replace function public.push_on_step()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'result_reviews' then
    -- 채점자가 다 온 뒤 한 번(3중 평가에서 동료 점수를 기다리는 동안은 알리지 않는다)
    if exists (select 1 from jsonb_array_elements(coalesce(new.panel, '[]'::jsonb)) e where e ->> 'status' = 'pending') then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.verdict = new.verdict and old.total is not distinct from new.total
       and not exists (select 1 from jsonb_array_elements(coalesce(old.panel, '[]'::jsonb)) e where e ->> 'status' = 'pending') then
      return new;
    end if;
    if new.verdict = 'redo' then
      perform push_enqueue(new.owner_id, new.task_id, 'review', '평가가 낮아 다시 개발을 보냈어요');
    else
      perform push_enqueue(new.owner_id, new.task_id, 'review', '평가 끝: 결과 승인 차례예요');
    end if;
  elsif tg_table_name = 'pr_checks' then
    -- 같은 커밋의 같은 결과는 한 번만(검사 상태를 여러 번 확인해도)
    if new.merged then
      return new;
    end if;
    if new.ci_state = 'success' and not exists (
      select 1 from pr_checks p where p.task_id = new.task_id and p.head_sha = new.head_sha and p.ci_state = 'success' and p.id <> new.id
    ) then
      perform push_enqueue(new.owner_id, new.task_id, 'pr', 'PR 검사 통과: 배포 승인 차례예요');
    elsif new.ci_state = 'failure' and not exists (
      select 1 from pr_checks p where p.task_id = new.task_id and p.head_sha = new.head_sha and p.ci_state = 'failure' and p.id <> new.id
    ) then
      perform push_enqueue(new.owner_id, new.task_id, 'blocked', 'PR 검사가 실패했어요');
    end if;
  elsif tg_table_name = 'deployments' then
    if new.ok then
      perform push_enqueue(new.owner_id, new.task_id, 'deploy', '배포까지 끝났어요');
    else
      perform push_enqueue(new.owner_id, new.task_id, 'blocked', '배포하지 못했어요');
    end if;
  elsif tg_table_name = 'design_drafts' then
    perform push_enqueue(new.owner_id, new.task_id, 'draft', '화면 시안이 왔어요');
  elsif tg_table_name = 'claude_research' then
    if new.status = 'done' and old.status is distinct from 'done' then
      perform push_enqueue(new.owner_id, null, 'answer', 'Claude가 찾아본 답이 왔어요');
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.push_on_step() from public, anon, authenticated;

create trigger push_result_reviews after insert or update of verdict, total, panel on public.result_reviews for each row execute function public.push_on_step();
create trigger push_pr_checks after insert on public.pr_checks for each row execute function public.push_on_step();
create trigger push_deployments after insert on public.deployments for each row execute function public.push_on_step();
create trigger push_design_drafts after insert on public.design_drafts for each row execute function public.push_on_step();
create trigger push_claude_research after update of status on public.claude_research for each row execute function public.push_on_step();
