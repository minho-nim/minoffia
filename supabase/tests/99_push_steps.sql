-- v0.7.35 대화 단계 알림을 휴대폰 알림으로도: 평가 끝·PR 검사·배포·시안·Claude 답
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'check failed: %', label; end if;
  raise notice 'ok: %', label;
end $$;
create function pg_temp.n(k text) returns int language sql as $$ select count(*)::int from push_outbox where task_id = '6b6b6b6b-0000-4000-8000-000000000001' and kind = k $$;

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'email', 'owner@example.invalid')::text, false);
set role authenticated;
insert into tasks (id, project_id, title, type, assignee) values ('6b6b6b6b-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '알림 시험', 'dev', 'codex');
reset role;

-- 평가: 동료 점수를 기다리는 동안은 알리지 않고, 다 오면 한 번
insert into result_reviews (owner_id, task_id, result_revision, verdict, total, panel)
values ('11111111-1111-4111-8111-111111111111', '6b6b6b6b-0000-4000-8000-000000000001', 7, 'owner', 90, '[{"who":"A","status":"done"},{"who":"peer","status":"pending"}]');
select pg_temp.check(pg_temp.n('review') = 0, '동료 점수 기다리는 동안은 평가 알림 없음');
update result_reviews set verdict = 'pass', panel = '[{"who":"A","status":"done"},{"who":"peer","status":"done"}]' where task_id = '6b6b6b6b-0000-4000-8000-000000000001';
select pg_temp.check(pg_temp.n('review') = 1, '채점이 다 오면 평가 끝 알림');
select pg_temp.check((select title from push_outbox where kind = 'review' and task_id = '6b6b6b6b-0000-4000-8000-000000000001') like '평가 끝%', '결과 승인 차례 문구');

-- PR 검사: 같은 커밋의 통과는 한 번
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, head_sha, ci_state) values ('11111111-1111-4111-8111-111111111111', '6b6b6b6b-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/1', 'open', false, 'abc', 'pending');
select pg_temp.check(pg_temp.n('pr') = 0, '검사 중은 알리지 않음');
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, head_sha, ci_state) values ('11111111-1111-4111-8111-111111111111', '6b6b6b6b-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/1', 'open', false, 'abc', 'success');
delete from push_outbox where kind = 'pr';
insert into pr_checks (owner_id, task_id, pr_url, pr_state, merged, head_sha, ci_state) values ('11111111-1111-4111-8111-111111111111', '6b6b6b6b-0000-4000-8000-000000000001', 'https://github.com/o/r/pull/1', 'open', false, 'abc', 'success');
select pg_temp.check(pg_temp.n('pr') = 0, '같은 커밋 통과를 다시 확인해도 알림 한 번');

-- 배포·시안·Claude 답
alter table deployments disable trigger deployments_guard;
insert into deployments (owner_id, task_id, repo, ok) values ('11111111-1111-4111-8111-111111111111', '6b6b6b6b-0000-4000-8000-000000000001', 'o/r', true);
alter table deployments enable trigger deployments_guard;
select pg_temp.check(pg_temp.n('deploy') = 1, '배포 끝 알림');
insert into design_drafts (owner_id, task_id, spec_revision, who, svg) values ('11111111-1111-4111-8111-111111111111', '6b6b6b6b-0000-4000-8000-000000000001', 1, 'A', '<svg/>');
insert into design_drafts (owner_id, task_id, spec_revision, who, svg) values ('11111111-1111-4111-8111-111111111111', '6b6b6b6b-0000-4000-8000-000000000001', 1, 'B', '<svg/>');
select pg_temp.check(pg_temp.n('draft') = 1, '시안 두 장은 알림 한 번');
insert into claude_research (id, owner_id, question, token_hash, expires_at) values ('6b6b6b6b-0000-4000-8000-0000000000aa', '11111111-1111-4111-8111-111111111111', '질문', 'h-push-step', now() + interval '1 hour');
update claude_research set status = 'done', answer = '답' where id = '6b6b6b6b-0000-4000-8000-0000000000aa';
select pg_temp.check((select count(*) from push_outbox where kind = 'answer') = 1, 'Claude 조사 답 알림');
