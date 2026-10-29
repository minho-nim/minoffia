import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Task, UsageRun } from '../domain/types';
import type { AgentAssignment, Approval, PmPlan, ResultPackage, TaskSpec } from '../domain/workflow-types';
import type { OfficeStore } from './store';

type Row = Record<string, unknown>;

const toProject = (r: Row): Project => ({
  id: r.id as string,
  name: r.name as string,
  repo: (r.repo as string | null) ?? null,
  description: (r.description as string) ?? '',
  createdAt: r.created_at as string,
});

const toTask = (r: Row): Task => ({
  id: r.id as string,
  projectId: r.project_id as string,
  title: r.title as string,
  description: (r.description as string) ?? '',
  type: r.type as Task['type'],
  requestedType: r.requested_type as Task['requestedType'],
  priority: r.priority as Task['priority'],
  assignee: r.assignee as Task['assignee'],
  routeReason: (r.route_reason as string) ?? '',
  status: r.status as Task['status'],
  dispatch: {
    state: r.dispatch_state as Task['dispatch']['state'],
    sessionUrl: (r.dispatch_session_url as string | null) ?? null,
    error: (r.dispatch_error as string | null) ?? null,
    at: (r.dispatch_at as string | null) ?? null,
  },
  stage: (r.stage as Task['stage']) ?? 'received',
  userOriginalText: (r.user_original_text as string | null) ?? undefined,
  prUrl: (r.pr_url as string | null) ?? null,
  dispatchSpecRevision: (r.dispatch_spec_revision as number | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toSpec = (r: Row): TaskSpec => ({
  id: r.id as string,
  taskId: r.task_id as string,
  revision: r.revision as number,
  intent: r.intent as TaskSpec['intent'],
  planner: 'chatgpt_manual',
  userOriginalText: r.user_original_text as string,
  finalPrompt: r.final_prompt as string,
  changeScope: r.change_scope as string,
  preserveConstraints: r.preserve_constraints as string,
  testCriteria: r.test_criteria as string,
  answer: r.answer as string,
  createdAt: r.created_at as string,
});

const toApproval = (r: Row): Approval => ({
  id: r.id as string,
  taskId: r.task_id as string,
  gate: r.gate as Approval['gate'],
  decision: r.decision as Approval['decision'],
  approvedRevision: r.approved_revision as number,
  previousRevision: (r.previous_revision as number | null) ?? null,
  workItemId: (r.work_item_id as string) ?? '',
  scope: (r.scope as Record<string, unknown>) ?? {},
  actor: (r.actor as string) ?? '',
  createdAt: r.created_at as string,
});

const toPlan = (r: Row): PmPlan => ({
  id: r.id as string,
  taskId: r.task_id as string,
  planRevision: r.plan_revision as number,
  approvedSpecRevision: r.approved_spec_revision as number,
  targetBaseRevision: (r.target_base_revision as string) ?? '',
  source: r.source as PmPlan['source'],
  plan: r.plan as PmPlan['plan'],
  createdAt: r.created_at as string,
});

const toAssignment = (r: Row): AgentAssignment => ({
  id: r.id as string,
  taskId: r.task_id as string,
  planRevision: r.plan_revision as number,
  workItemId: r.work_item_id as string,
  title: (r.title as string) ?? '',
  assignee: r.assignee as AgentAssignment['assignee'],
  executionMode: r.execution_mode as AgentAssignment['executionMode'],
  dispatchStatus: r.dispatch_status as AgentAssignment['dispatchStatus'],
  statusSource: r.status_source as AgentAssignment['statusSource'],
  providerExecutionId: (r.provider_execution_id as string | null) ?? null,
  providerTaskUrl: (r.provider_task_url as string | null) ?? null,
  actualProviderStatus: (r.actual_provider_status as string) ?? 'unknown',
  startedAt: (r.started_at as string | null) ?? null,
  lastVerifiedAt: (r.last_verified_at as string | null) ?? null,
  updatedAt: r.updated_at as string,
});

const toResult = (r: Row): ResultPackage => ({
  id: r.id as string,
  taskId: r.task_id as string,
  revision: r.revision as number,
  planRevision: (r.plan_revision as number | null) ?? null,
  workItemId: (r.work_item_id as string) ?? '',
  source: r.source as ResultPackage['source'],
  summary: r.summary as string,
  diff: r.diff as string,
  testLog: r.test_log as string,
  remainingIssues: r.remaining_issues as string,
  sha256: r.sha256 as string,
  createdAt: r.created_at as string,
});

const toRun = (r: Row): UsageRun => ({
  id: r.id as string,
  agent: r.agent as UsageRun['agent'],
  taskId: (r.task_id as string | null) ?? null,
  kind: r.kind as UsageRun['kind'],
  day: r.day as string,
  createdAt: r.created_at as string,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseStore(client: SupabaseClient): OfficeStore {
  return {
    mode: 'supabase',
    async load() {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [projects, tasks, usage, specs, approvals, plans, assignments, results] = await Promise.all([
        client.from('projects').select('*').order('created_at'),
        client.from('tasks').select('*').order('created_at', { ascending: false }),
        client.from('usage_runs').select('*').gte('created_at', since),
        client.from('task_specs').select('*').order('revision'),
        client.from('approvals').select('*').order('created_at'),
        client.from('pm_plans').select('*').order('plan_revision'),
        client.from('agent_assignments').select('*').order('work_item_id'),
        // 결과 목록에는 큰 diff·로그를 빼고, 필요할 때만 읽는 대신 v0.2.1은 크기 상한(500KB)으로 제한한다.
        client.from('result_packages').select('*').order('revision'),
      ]);
      return {
        projects: (check(projects) ?? []).map(toProject),
        tasks: (check(tasks) ?? []).map(toTask),
        usage: (check(usage) ?? []).map(toRun),
        workflow: {
          specs: (check(specs) ?? []).map(toSpec),
          approvals: (check(approvals) ?? []).map(toApproval),
          plans: (check(plans) ?? []).map(toPlan),
          assignments: (check(assignments) ?? []).map(toAssignment),
          results: (check(results) ?? []).map(toResult),
        },
      };
    },
    async saveProject(p) {
      check(await client.from('projects').upsert({ id: p.id, name: p.name, repo: p.repo, description: p.description }));
    },
    async deleteProject(id) {
      check(await client.from('projects').delete().eq('id', id));
    },
    async saveTask(t) {
      // dispatch_* 열은 서버(Edge Function)만 바꾼다. DB 트리거도 클라이언트 변경을 무시한다.
      check(
        await client.from('tasks').upsert({
          id: t.id,
          project_id: t.projectId,
          title: t.title,
          description: t.description,
          type: t.type,
          requested_type: t.requestedType,
          priority: t.priority,
          assignee: t.assignee,
          route_reason: t.routeReason,
          status: t.status,
          stage: t.stage ?? 'received',
          user_original_text: t.userOriginalText ?? null,
          pr_url: t.prUrl ?? null,
        }),
      );
    },
    async deleteTask(id) {
      check(await client.from('tasks').delete().eq('id', id));
    },
    async addManualRun(r) {
      check(await client.from('usage_runs').insert({ id: r.id, agent: r.agent, task_id: r.taskId, kind: 'manual' }));
    },
    async addSpec(x) {
      check(
        await client.from('task_specs').insert({
          id: x.id,
          task_id: x.taskId,
          revision: x.revision,
          intent: x.intent,
          planner: x.planner,
          user_original_text: x.userOriginalText,
          final_prompt: x.finalPrompt,
          change_scope: x.changeScope,
          preserve_constraints: x.preserveConstraints,
          test_criteria: x.testCriteria,
          answer: x.answer,
        }),
      );
    },
    async addApproval(x) {
      // 승인자(actor)는 서버가 로그인 정보로 채운다.
      check(
        await client.from('approvals').insert({
          id: x.id,
          task_id: x.taskId,
          gate: x.gate,
          decision: x.decision,
          approved_revision: x.approvedRevision,
          previous_revision: x.previousRevision,
          work_item_id: x.workItemId,
          scope: x.scope,
        }),
      );
    },
    async addPlan(p, assignments) {
      check(
        await client.from('pm_plans').insert({
          id: p.id,
          task_id: p.taskId,
          plan_revision: p.planRevision,
          approved_spec_revision: p.approvedSpecRevision,
          target_base_revision: p.targetBaseRevision,
          source: p.source,
          plan: p.plan,
        }),
      );
      if (assignments.length) {
        check(
          await client.from('agent_assignments').insert(
            assignments.map((a) => ({
              id: a.id,
              task_id: a.taskId,
              plan_revision: a.planRevision,
              work_item_id: a.workItemId,
              title: a.title,
              assignee: a.assignee,
              execution_mode: a.executionMode,
              dispatch_status: a.dispatchStatus,
            })),
          ),
        );
      }
    },
    async updateAssignment(a) {
      check(
        await client
          .from('agent_assignments')
          .update({
            dispatch_status: a.dispatchStatus,
            status_source: a.statusSource,
            provider_task_url: a.providerTaskUrl,
            actual_provider_status: a.actualProviderStatus,
            started_at: a.startedAt,
          })
          .eq('id', a.id),
      );
    },
    async addResult(x) {
      check(
        await client.from('result_packages').insert({
          id: x.id,
          task_id: x.taskId,
          revision: x.revision,
          plan_revision: x.planRevision,
          work_item_id: x.workItemId,
          source: x.source,
          summary: x.summary,
          diff: x.diff,
          test_log: x.testLog,
          remaining_issues: x.remainingIssues,
          sha256: x.sha256,
        }),
      );
    },
  };
}
