import type { Task, TaskStatus } from './types';
import type { AgentAssignment, Approval, Gate, PmPlan, ResultPackage, Stage, TaskSpec, WorkflowData } from './workflow-types';

/** 한 업무에 딸린 기록만 모은다. */
export function forTask(data: WorkflowData, taskId: string): WorkflowData {
  return {
    specs: data.specs.filter((x) => x.taskId === taskId),
    approvals: data.approvals.filter((x) => x.taskId === taskId),
    plans: data.plans.filter((x) => x.taskId === taskId),
    assignments: data.assignments.filter((x) => x.taskId === taskId),
    results: data.results.filter((x) => x.taskId === taskId),
  };
}

const latest = <T>(list: T[], key: (x: T) => number): T | null =>
  list.reduce<T | null>((best, x) => (best === null || key(x) > key(best) ? x : best), null);

const approved = (approvals: Approval[], gate: Gate, revision: number, workItemId = '') =>
  approvals.some((a) => a.gate === gate && a.decision === 'approved' && a.approvedRevision === revision && a.workItemId === workItemId);

export interface WorkflowView {
  stage: Stage;
  spec: TaskSpec | null;
  /** 최신 기획서가 A 승인됐는가. 기획서가 바뀌면 자동으로 false가 된다. */
  aApproved: boolean;
  /** 이전 버전은 승인됐지만 최신 버전은 아직인 경우 */
  aStale: boolean;
  plan: PmPlan | null;
  /** 계획이 최신 A 승인 기획서를 기준으로 했는가 */
  planCurrent: boolean;
  assignments: AgentAssignment[];
  eApproved: (workItemId: string) => boolean;
  result: ResultPackage | null;
  bApproved: boolean;
  cApproved: boolean;
}

/** DB 기록만으로 현재 단계를 계산한다. 배정 완료 ≠ 실행 중, PM 세션 시작 ≠ 계획 완료. */
export function deriveWorkflow(task: Task, all: WorkflowData): WorkflowView {
  const d = forTask(all, task.id);
  const spec = latest(d.specs, (s) => s.revision);
  const aApproved = spec ? approved(d.approvals, 'A', spec.revision) : false;
  const aStale = !!spec && !aApproved && d.approvals.some((a) => a.gate === 'A' && a.decision === 'approved');
  const plan = latest(d.plans, (p) => p.planRevision);
  const planCurrent = !!plan && !!spec && aApproved && plan.approvedSpecRevision === spec.revision;
  const assignments = plan ? d.assignments.filter((a) => a.planRevision === plan.planRevision) : [];
  const result = latest(d.results, (r) => r.revision);
  const bApproved = result ? approved(d.approvals, 'B', result.revision) : false;
  const cApproved = result ? bApproved && approved(d.approvals, 'C', result.revision) : false;
  const eApproved = (id: string) => (plan ? approved(d.approvals, 'E', plan.planRevision, id) : false);

  const stage = ((): Stage => {
    if (task.status === 'done' && !spec) return 'completed';
    if (!spec) return 'received';
    if (spec.intent === 'question') return spec.answer ? 'completed' : 'planning';
    if (spec.intent === 'ambiguous') return 'needs_clarification';
    if (!aApproved) return 'development_approval_pending';
    if (cApproved) return 'completed';
    if (bApproved) return 'deployment_approval_pending';
    if (result) return 'github_approval_pending';
    if (!planCurrent) {
      if (task.dispatch.state === 'failed') return 'integration_blocked';
      if (task.dispatch.state === 'dispatching' || task.dispatch.state === 'dispatched') return 'dispatching';
      return 'pm_queued';
    }
    if (plan?.plan.status === 'needs_clarification') return 'needs_clarification';
    if (assignments.some((a) => a.dispatchStatus === 'blocked_quota')) return 'rate_limited';
    if (assignments.some((a) => a.dispatchStatus === 'started' || a.dispatchStatus === 'starting')) return 'executing';
    return 'agent_handoff_pending';
  })();

  return { stage, spec, aApproved, aStale, plan, planCurrent, assignments, eApproved, result, bApproved, cApproved };
}

export type GateCheck = { ok: true } | { ok: false; reason: string };

/** DB 트리거(approvals_guard)와 같은 규칙. 화면에서 버튼을 켜고 끌 때 쓰고, 최종 판단은 DB가 한다. */
export function canApprove(view: WorkflowView, gate: Gate, workItemId = ''): GateCheck {
  switch (gate) {
    case 'A':
      if (!view.spec) return { ok: false, reason: '기획서가 아직 없습니다.' };
      if (view.spec.intent === 'question' || view.spec.intent === 'ambiguous')
        return { ok: false, reason: '단순 질문·의도 불분명 기획서는 개발 승인 대상이 아닙니다.' };
      if (view.aApproved) return { ok: false, reason: '이 버전은 이미 승인했습니다.' };
      return { ok: true };
    case 'E': {
      if (!view.planCurrent) return { ok: false, reason: 'A 승인된 최신 기획서 기준의 PM 계획이 필요합니다.' };
      if (!view.assignments.some((a) => a.workItemId === workItemId)) return { ok: false, reason: '계획에 없는 작업입니다.' };
      if (view.eApproved(workItemId)) return { ok: false, reason: '이미 실행 승인한 작업입니다.' };
      return { ok: true };
    }
    case 'B':
      if (!view.result) return { ok: false, reason: '검토할 결과 패키지가 없습니다.' };
      if (view.bApproved) return { ok: false, reason: '이 결과는 이미 업로드 승인했습니다.' };
      return { ok: true };
    case 'C':
      if (!view.result || !view.bApproved) return { ok: false, reason: '같은 결과의 B 승인이 먼저 필요합니다.' };
      if (view.cApproved) return { ok: false, reason: '이미 배포 승인했습니다.' };
      return { ok: true };
  }
}

/** 오피스 캐릭터가 쓰는 v0.1 상태로 옮긴다. 실제 기록이 없는 단계는 대기로 둔다. */
export function officeStatus(stage: Stage, current: TaskStatus): TaskStatus {
  switch (stage) {
    case 'completed':
      return 'done';
    case 'dispatching':
    case 'executing':
      return 'in_progress';
    case 'github_approval_pending':
    case 'result_review':
    case 'deployment_approval_pending':
    case 'pr_review':
      return 'review';
    case 'integration_blocked':
    case 'failed':
    case 'rate_limited':
    case 'paused':
      return 'blocked';
    case 'received':
      return current;
    default:
      return 'queued';
  }
}

/** 결과 패키지 무결성 확인용 SHA-256(16진수). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
