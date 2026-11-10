// 승인 3개(v0.6.22, 소유자 2026-11-10 "너무 복잡해, 승인 3개"): 소유자는 기획 승인(A) → 결과 승인(B, 올리기) → 배포 승인(C)만 누른다.
// 실행 승인(E)은 없애지 않고(DB 게이트·감사 기록 유지) 기획 승인에 포함해 앱이 자동으로 기록한다(scope.auto = true).
// 견본 먼저 계획은 견본 승인(P) 뒤에만, 확인 질문이 남은 계획은 자동으로 기록하지 않는다.
import { canApprove, type WorkflowView } from './workflow';
import type { AgentAssignment, Approval } from './workflow-types';

export const AUTO_E_NOTE = '기획 승인에 포함(소유자 결정 2026-11-10)';

/** 자동으로 실행 승인(E)을 기록할 작업 */
export function autoExecutionTargets(view: WorkflowView): AgentAssignment[] {
  if (!view.aApproved || !view.planCurrent || !view.plan || view.plan.plan.status !== 'planned') return [];
  if (view.prototypeFirst && !view.pApproved) return [];
  return view.assignments.filter(
    (a) => a.dispatchStatus === 'awaiting_user_execution_approval' && !view.eApproved(a.workItemId) && canApprove(view, 'E', a.workItemId).ok,
  );
}

/** 서버가 먼저 하게 앱이 기다릴 시간(v0.6.28 '앱을 닫아 둬도 진행'): 서버가 받은 계획·서버가 기록한 승인은 1분 뒤에만 앱이 손댄다 */
export const SERVER_FIRST_MS = 60_000;

/** 서버가 이어서 할 몫인가(서버가 받은 계획이 갓 왔거나, 서버가 갓 기록한 실행 승인) */
export function serverTurn(at: string, byServer: boolean, now: number = Date.now()): boolean {
  return byServer && now - Date.parse(at) < SERVER_FIRST_MS;
}

/** 이 작업의 실행 승인이 자동 기록인가(그러면 앱이 바로 시작한다) */
export function autoApproved(approvals: Approval[], a: AgentAssignment): boolean {
  return approvals.some(
    (x) => x.taskId === a.taskId && x.gate === 'E' && x.decision === 'approved' && x.approvedRevision === a.planRevision && x.workItemId === a.workItemId && x.scope?.auto === true,
  );
}
