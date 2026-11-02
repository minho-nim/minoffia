-- MinLab AI Office v0.4.94 코딩 결과는 Claude가 채점(소유자 2026-11-02 "그림은 내가 보고 고르기, 코딩 작업은 클로드가 보고 채점").
-- review-result가 규칙 검사를 지난 결과를 보조 개발 루틴(채점 전용, 쓰기 금지)에 보내고, 세션이 점수를 submit-review로 보낸다.
-- 1회용 제출표(plan_submit_tokens)를 채점에도 쓴다(kind 'review', 결과 버전 하나 전용). 결과 버전마다 한 번만 보낸다.
-- 세션이 6시간 안에 점수를 안 보내면(또는 Claude가 휴가·상한·미연결이면) 예전처럼 Gemini 무료가 채점한다.

alter table public.plan_submit_tokens drop constraint if exists plan_submit_tokens_kind_check;
alter table public.plan_submit_tokens add constraint plan_submit_tokens_kind_check check (kind in ('plan', 'result', 'review'));
alter table public.plan_submit_tokens add column if not exists result_revision integer check (result_revision is null or result_revision >= 1);
alter table public.plan_submit_tokens drop constraint if exists plan_submit_tokens_result_needs_assignment;
alter table public.plan_submit_tokens add constraint plan_submit_tokens_result_needs_assignment check (kind <> 'result' or assignment_id is not null);
alter table public.plan_submit_tokens drop constraint if exists plan_submit_tokens_review_needs_revision;
alter table public.plan_submit_tokens add constraint plan_submit_tokens_review_needs_revision check (kind <> 'review' or result_revision is not null);
create unique index if not exists plan_submit_tokens_review_once on public.plan_submit_tokens (task_id, result_revision) where kind = 'review';
