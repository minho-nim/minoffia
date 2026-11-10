\set ON_ERROR_STOP on
-- v0.6.13 개발 중 추가 요청: 소유자만 자기 업무에 추가하고 읽는다. 고치기·지우기·used_at 채워 넣기는 안 된다.
begin;
create function pg_temp.expect_fail(q text, needle text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if position(needle in sqlerrm)=0 then raise exception 'expected %, got %',needle,sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure: %',needle;
end $$;
insert into auth.users(id,email) values ('f0450000-0000-4000-8000-000000000001','fu@example.invalid'), ('f0450000-0000-4000-8000-000000000002','other@example.invalid');
insert into projects(id,owner_id,name,repo) values ('a0450000-0000-4000-8000-000000000001','f0450000-0000-4000-8000-000000000001','FU','owner/test');
insert into tasks(id,owner_id,project_id,title,type,assignee) values ('b0450000-0000-4000-8000-000000000001','f0450000-0000-4000-8000-000000000001','a0450000-0000-4000-8000-000000000001','FU','dev','codex');
select set_config('request.jwt.claims','{"sub":"f0450000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into task_followups(task_id,text) values ('b0450000-0000-4000-8000-000000000001','버튼 색도 바꿔줘');
select pg_temp.expect_fail($q$insert into task_followups(task_id,text,used_at) values ('b0450000-0000-4000-8000-000000000001','x', now())$q$,'row-level security');
update task_followups set text = '바꿈';
do $$ begin if (select text from task_followups limit 1) <> '버튼 색도 바꿔줘' then raise exception 'update must not change rows'; end if; end $$;
-- 다른 사람은 보지도 넣지도 못한다
select set_config('request.jwt.claims','{"sub":"f0450000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin if (select count(*) from task_followups) <> 0 then raise exception 'other user must not see'; end if; end $$;
select pg_temp.expect_fail($q$insert into task_followups(task_id,text) values ('b0450000-0000-4000-8000-000000000001','x')$q$,'task does not belong to owner');
rollback;
