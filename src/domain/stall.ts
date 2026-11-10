/**
 * 멈춤 자동 감지(규칙만, AI 호출 없음): 자동으로 넘어가야 할 단계가 정해진 시간보다 오래 그대로면 알린다.
 * 완료나 실패로 바꾸지 않는다. 사용자가 무엇을 확인하면 되는지만 "내 차례"에 [!]로 보인다.
 */
import type { Task } from './types';
import { deriveWorkflow, latestPrCheck } from './workflow';
import type { WorkflowData } from './workflow-types';

export interface Stall {
  taskId: string;
  /** 업무 종류(계획·개발·올리기) */
  word: string;
  label: string;
  /** 멈춘 것으로 보기 시작한 기준 시각 */
  since: string;
}

const MIN = 60_000;
/** 기다리는 시간(분): PM 계획, Claude 개발 결과, Codex 결과 옮기기, 올리기 승인 뒤 PR 열림 */
export const STALL_AFTER = { plan: 30, claudeDev: 180, codexDev: 24 * 60, pr: 60 } as const;

const older = (iso: string | null | undefined, minutes: number, now: number) => !!iso && now - Date.parse(iso) > minutes * MIN;

export function stalls(tasks: Task[], all: WorkflowData, now: number = Date.now()): Stall[] {
  const out: Stall[] = [];
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const v = deriveWorkflow(t, all);

    if (v.stage === 'dispatching' && older(t.dispatch.at, STALL_AFTER.plan, now)) {
      out.push({ taskId: t.id, word: '계획', label: `PM 계획이 ${STALL_AFTER.plan}분 넘게 안 와요. 업무 카드에서 PM 세션을 열어 확인하거나 계획을 붙여넣으세요.`, since: t.dispatch.at! });
    }

    if (v.plan && !v.result) {
      for (const a of all.assignments.filter((x) => x.taskId === t.id && x.planRevision === v.plan!.planRevision && x.dispatchStatus === 'started')) {
        const since = a.startedAt ?? a.lastVerifiedAt ?? a.updatedAt;
        if (a.assignee === 'claude' && older(since, STALL_AFTER.claudeDev, now)) {
          out.push({ taskId: t.id, word: '개발', label: `Claude 결과가 ${STALL_AFTER.claudeDev / 60}시간 넘게 안 와요(${a.workItemId}). 업무 카드에서 세션을 열어 확인하세요.`, since });
        } else if (a.assignee !== 'claude' && older(since, STALL_AFTER.codexDev, now)) {
          out.push({ taskId: t.id, word: '개발', label: `${a.workItemId} 결과가 하루 넘게 없어요. 끝났으면 결과를 옮기고, 안 할 거면 중단하세요.`, since });
        }
      }
    }

    // 올리기 승인 뒤 PR이 열리지 않거나 CI 확인이 끝나지 않음
    if (v.bApproved && !v.cApproved) {
      const b = all.approvals.filter((a) => a.taskId === t.id && a.gate === 'B' && a.decision === 'approved').sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
      const check = latestPrCheck(t, all);
      if (b && !t.prUrl && older(b.createdAt, STALL_AFTER.pr, now)) {
        out.push({ taskId: t.id, word: '올리기', label: `결과 승인 뒤 ${STALL_AFTER.pr}분이 지났는데 PR이 없어요. 업무 카드의 'PR 다시 열기'를 누르세요.`, since: b.createdAt });
      } else if (check?.ciState === 'failure') {
        out.push({ taskId: t.id, word: '올리기', label: 'PR의 CI(시험)가 실패했어요. PR을 확인하거나 결과 검토에서 수정 요청하세요.', since: check.checkedAt });
      }
    }
  }
  return out;
}
