\set ON_ERROR_STOP on
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'check failed: %', label; end if;
end $$;
insert into auth.users(id,email) values ('f0380000-0000-4000-8000-000000000001','pm-test@example.invalid');
select set_config('request.jwt.claims','{"sub":"f0380000-0000-4000-8000-000000000001","role":"authenticated","email":"pm-test@example.invalid"}',true);
set local role authenticated;
insert into projects(id,name,repo) values ('a0380000-0000-4000-8000-000000000001','PM test','owner/test');
insert into tasks(id,project_id,title,type,assignee) values ('b0380000-0000-4000-8000-000000000001','a0380000-0000-4000-8000-000000000001','PM test','dev','codex');
insert into task_specs(task_id,revision,intent,user_original_text,final_prompt) values ('b0380000-0000-4000-8000-000000000001',1,'change_request','test','test');
-- 브라우저에서 예약 RPC를 직접 실행할 수 없어야 한다.
do $$ begin
  perform * from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test');
  raise exception 'client claim should fail';
exception when insufficient_privilege then null; end $$;
set local role service_role;
select pg_temp.check((select reason = 'stale_spec' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test')), 'A required');
select pg_temp.check((select reason = 'not_owner' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',1,20,'test')), 'owner required');
set local role authenticated;
insert into approvals(task_id,gate,decision,approved_revision) values ('b0380000-0000-4000-8000-000000000001','A','approved',1);
set local role service_role;
select pg_temp.check((select state = 'claimed' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test')), 'first claim');
select pg_temp.check((select state = 'busy' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test')), 'other device busy');
select pg_temp.check((select count(*) = 1 from ai_calls where owner_id='f0380000-0000-4000-8000-000000000001'), 'only one reservation counted');
update gemini_pm_drafts set state='completed',plan_text='cached plan' where owner_id='f0380000-0000-4000-8000-000000000001';
select pg_temp.check((select state = 'cached' and plan_text = 'cached plan' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,1,'test')), 'cache works even at cap');
set local role authenticated;
select pg_temp.check((select count(*) = 0 from gemini_pm_drafts), 'private cached content not readable by clients');
insert into clarifications(task_id,spec_revision,question,answer) values ('b0380000-0000-4000-8000-000000000001',1,'Q','A');
set local role service_role;
select pg_temp.check((select reason = 'daily_cap' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,1,'test')), 'new context still obeys daily cap');
select pg_temp.check((select state = 'claimed' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test')), 'clarification allows new draft');
update gemini_pm_drafts set state='failed' where state='running' and owner_id='f0380000-0000-4000-8000-000000000001';
select pg_temp.check((select state = 'claimed' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test')), 'failed request can retry');
select pg_temp.check((select count(*) = 3 from ai_calls where owner_id='f0380000-0000-4000-8000-000000000001'), 'failures count toward cap');
update gemini_pm_drafts set locked_until=now()-interval '1 minute' where state='running' and owner_id='f0380000-0000-4000-8000-000000000001';
select pg_temp.check((select state = 'claimed' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test')), 'abandoned lease recovers');
set local role authenticated;
insert into task_specs(task_id,revision,intent,user_original_text,final_prompt) values ('b0380000-0000-4000-8000-000000000001',2,'change_request','v2','v2');
insert into approvals(task_id,gate,decision,approved_revision) values ('b0380000-0000-4000-8000-000000000001','A','approved',2);
set local role service_role;
select pg_temp.check((select reason = 'stale_spec' from claim_gemini_pm('b0380000-0000-4000-8000-000000000001','f0380000-0000-4000-8000-000000000001',1,20,'test')), 'old version cache cannot bypass current version check');
rollback;
\echo 'Gemini PM reservation tests passed'
