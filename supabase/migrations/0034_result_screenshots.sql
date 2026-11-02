-- MinLab AI Office v0.4.97 결과 화면 증거(소유자 "눈으로 확인", The Agency 증거 수집 아이디어).
-- 자동 개발(Gemini Actions 등)이 데스크톱·휴대폰 화면을 찍어 결과와 함께 보내면, 서버(submit-result)가 비공개 버킷에 올리고
-- 그 경로를 받은 결과(dev_result_inbox.screenshots)에 남긴다. 앱이 결과 패키지로 옮길 때 결과 스크린샷(kind result, role after)으로 붙인다.
alter table public.dev_result_inbox add column if not exists screenshots jsonb not null default '[]'::jsonb;

-- 받은 결과 원문은 고칠 수 없다(스크린샷 목록·미리보기 주소 포함).
create or replace function public.dev_result_inbox_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.summary, new.changed_files, new.diff, new.test_log, new.remaining_issues, new.branch, new.task_id, new.assignment_id, new.owner_id, new.created_at, new.screenshots, new.preview_url)
     is distinct from (old.summary, old.changed_files, old.diff, old.test_log, old.remaining_issues, old.branch, old.task_id, old.assignment_id, old.owner_id, old.created_at, old.screenshots, old.preview_url) then
    raise exception 'dev_result_inbox: only status and note can change';
  end if;
  if old.status <> 'new' then
    raise exception 'dev_result_inbox: already handled';
  end if;
  return new;
end;
$$;
revoke execute on function public.dev_result_inbox_guard() from public, anon, authenticated;
