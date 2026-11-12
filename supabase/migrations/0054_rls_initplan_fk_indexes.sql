-- DB 성능 정리(v0.6.87, Supabase 성능 점검): 권한은 그대로 두고
-- 1) 보안 규칙 17개가 줄마다 auth.uid()를 다시 부르던 것을 (select auth.uid())로 한 번만 부르게 한다(규칙 내용·대상·명령은 같음)
-- 2) 색인이 없던 연결 칸(외래 키) 29개에 색인을 단다.

alter policy agent_assignments_insert on public.agent_assignments with check (owner_id = (select auth.uid()));
alter policy agent_assignments_select on public.agent_assignments using (owner_id = (select auth.uid()));
alter policy agent_assignments_update on public.agent_assignments using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy approvals_insert on public.approvals with check (owner_id = (select auth.uid()));
alter policy approvals_select on public.approvals using (owner_id = (select auth.uid()));
alter policy pm_plans_insert on public.pm_plans with check (owner_id = (select auth.uid()));
alter policy pm_plans_select on public.pm_plans using (owner_id = (select auth.uid()));
alter policy projects_owner on public.projects using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy result_packages_insert on public.result_packages with check (owner_id = (select auth.uid()));
alter policy result_packages_select on public.result_packages using (owner_id = (select auth.uid()));
alter policy revision_requests_insert on public.revision_requests with check (owner_id = (select auth.uid()));
alter policy revision_requests_select on public.revision_requests using (owner_id = (select auth.uid()));
alter policy task_specs_insert on public.task_specs with check (owner_id = (select auth.uid()));
alter policy task_specs_select on public.task_specs using (owner_id = (select auth.uid()));
alter policy tasks_owner on public.tasks using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy usage_insert_manual on public.usage_runs with check (owner_id = (select auth.uid()) and kind = 'manual');
alter policy usage_select on public.usage_runs using (owner_id = (select auth.uid()));

create index if not exists agent_assignments_owner_id_idx on public.agent_assignments (owner_id);
create index if not exists approvals_owner_id_idx on public.approvals (owner_id);
create index if not exists attachments_owner_id_idx on public.attachments (owner_id);
create index if not exists chat_messages_project_id_idx on public.chat_messages (project_id);
create index if not exists chat_messages_task_id_idx on public.chat_messages (task_id);
create index if not exists clarifications_owner_id_idx on public.clarifications (owner_id);
create index if not exists deployments_owner_id_idx on public.deployments (owner_id);
create index if not exists dev_result_inbox_assignment_id_idx on public.dev_result_inbox (assignment_id);
create index if not exists dev_result_inbox_task_id_idx on public.dev_result_inbox (task_id);
create index if not exists gemini_pm_drafts_call_id_idx on public.gemini_pm_drafts (call_id);
create index if not exists gemini_pm_drafts_owner_id_idx on public.gemini_pm_drafts (owner_id);
create index if not exists image_analyses_task_id_idx on public.image_analyses (task_id);
create index if not exists managed_repos_project_id_idx on public.managed_repos (project_id);
create index if not exists plan_submit_tokens_assignment_id_idx on public.plan_submit_tokens (assignment_id);
create index if not exists plan_submit_tokens_owner_id_idx on public.plan_submit_tokens (owner_id);
create index if not exists pm_plan_inbox_task_id_idx on public.pm_plan_inbox (task_id);
create index if not exists pm_plans_owner_id_idx on public.pm_plans (owner_id);
create index if not exists pr_checks_owner_id_idx on public.pr_checks (owner_id);
create index if not exists pr_dispatches_owner_id_idx on public.pr_dispatches (owner_id);
create index if not exists project_rules_owner_id_idx on public.project_rules (owner_id);
create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists push_outbox_owner_id_idx on public.push_outbox (owner_id);
create index if not exists push_outbox_task_id_idx on public.push_outbox (task_id);
create index if not exists result_packages_owner_id_idx on public.result_packages (owner_id);
create index if not exists revision_requests_owner_id_idx on public.revision_requests (owner_id);
create index if not exists task_followups_owner_id_idx on public.task_followups (owner_id);
create index if not exists task_specs_owner_id_idx on public.task_specs (owner_id);
create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists usage_runs_task_id_idx on public.usage_runs (task_id);
