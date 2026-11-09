import { newId } from '../data/store';
import { PREF_AGENT, parsePmPlan } from '../domain/pmPlan';
import { deriveWorkflow } from '../domain/workflow';
import { applyMention, mentionAllowed, mentionedAssignee } from '../domain/mention';
import { REASSIGN_MARK } from '../domain/reassign';
import type { Task, Snapshot } from '../domain/types';
import type { AgentAssignment, PmPlan } from '../domain/workflow-types';

/** 응답이 만들어진 기획서 버전을 유지한다. 다른 기기에서 새 버전을 승인해도 바꿔 붙이지 않는다. */
export function preparePlanImport(task: Task, text: string, source: PmPlan['source'], data: Snapshot, expectedSpecRevision?: number):
  { plan: PmPlan; assignments: AgentAssignment[]; existing?: boolean; errors?: never } | { errors: string[] } {
  const view = deriveWorkflow(task, data.workflow);
  const parsed = parsePmPlan(text, task.id);
  if (!parsed.ok) return { errors: parsed.errors };
  if (!view.spec || !view.aApproved) return { errors: ['최신 기획서의 기획 승인이 먼저 필요합니다.'] };
  if (expectedSpecRevision !== undefined && view.spec.revision !== expectedSpecRevision)
    return { errors: [`기획서 v${expectedSpecRevision}로 만든 계획입니다. 현재 v${view.spec.revision}에는 저장하지 않았습니다.`] };
  if (source === 'gemini_fallback' && parsed.plan.generation_id) {
    const existing = data.workflow.plans.find((p) => p.taskId === task.id && p.plan.generation_id === parsed.plan.generation_id);
    if (existing) return { plan: existing, assignments: [], existing: true };
  }
  const planRevision = Math.max(0, ...data.workflow.plans.filter((p) => p.taskId === task.id).map((p) => p.planRevision)) + 1;
  // @이름으로 맡긴 업무는 PM이 나눈 작업도 모두 그 AI가 맡는다(v0.5.46)
  const mention = mentionedAssignee(task.userOriginalText ?? task.description);
  const repo = data.projects.find((p) => p.id === task.projectId)?.repo;
  // 소유자가 담당을 직접 바꾼 계획(v0.5.73)에는 @이름을 다시 적용하지 않는다
  const reassigned = (parsed.plan.mode_reason ?? '').includes(REASSIGN_MARK);
  if (mention && !reassigned && mentionAllowed(mention, repo) && parsed.plan.work_items.some((w) => w.assignee_preference !== mention.preference)) {
    parsed.plan.work_items = applyMention(parsed.plan.work_items, mention);
    parsed.plan.mode_reason = `${parsed.plan.mode_reason ? `${parsed.plan.mode_reason} · ` : ''}소유자가 @${mention.label} 지정`.slice(0, 300);
  }
  const plan: PmPlan = {
    id: newId(),
    taskId: task.id,
    planRevision,
    approvedSpecRevision: view.spec.revision,
    targetBaseRevision: parsed.plan.target_base_revision,
    source,
    plan: { ...parsed.plan, plan_revision: planRevision },
    createdAt: new Date().toISOString(),
  };
  const assignments: AgentAssignment[] = parsed.plan.work_items.map((w) => ({
    id: newId(),
    taskId: task.id,
    planRevision,
    workItemId: w.id,
    title: w.title,
    assignee: PREF_AGENT[w.assignee_preference],
    // 자동 실행 경로가 검증되기 전까지는 계획이 codex_cloud라고 해도 수동 인계로 둔다.
    // Gemini 개발(gemini_dev)은 실행 승인 뒤 서버가 GitHub Actions 워크플로로 시작한다(v0.4.82).
    executionMode: w.assignee_preference === 'gemini_dev' ? 'gemini_actions' : 'manual_handoff',
    dispatchStatus: 'awaiting_user_execution_approval',
    statusSource: 'none',
    providerExecutionId: null,
    providerTaskUrl: null,
    actualProviderStatus: 'unknown',
    startedAt: null,
    lastVerifiedAt: null,
    updatedAt: new Date().toISOString(),
  }));
  return { plan, assignments };
}
