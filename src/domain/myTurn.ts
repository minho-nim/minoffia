/**
 * "내 차례" 목록: 사용자가 손대야 하는 일(승인·답·시작)만 업무 단계로 모은다(규칙만).
 * 사무실 말풍선의 ?와 같은 기준이다. 바로 끝낼 수 있는 승인(A·B)은 quick으로 표시한다.
 */
import type { Task } from './types';
import { canApprove, deriveWorkflow, latestPrCheck, prCheckPasses } from './workflow';
import type { WorkflowData } from './workflow-types';

export interface MyTurn {
  taskId: string;
  title: string;
  /** 단계 이름(기획·실행·견본·개발·결과·배포·질문) */
  word: string;
  /** 할 일 한 줄 */
  label: string;
  /** 목록에서 바로 누를 수 있는 승인. 없으면 업무 카드에서 */
  quick?: 'A' | 'B';
  /** 정렬용(오래 기다린 것부터) */
  at: string;
}

export function myTurns(tasks: Task[], all: WorkflowData): MyTurn[] {
  const out: MyTurn[] = [];
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const v = deriveWorkflow(t, all);
    const add = (word: string, label: string, quick?: 'A' | 'B') => out.push({ taskId: t.id, title: t.title, word, label, quick, at: t.updatedAt });
    const mine = v.plan ? all.assignments.filter((a) => a.taskId === t.id && a.planRevision === v.plan!.planRevision) : [];
    switch (v.stage) {
      case 'needs_clarification':
        add('질문', '확인 질문에 답해 주세요(입력창이나 업무 카드)');
        break;
      case 'spec_ready':
      case 'development_approval_pending':
        add('기획', '기획서를 보고 승인하거나 수정 요청', canApprove(v, 'A').ok ? 'A' : undefined);
        break;
      case 'agent_handoff_pending':
        if (v.prototypeFirst && !v.pApproved && v.prototypeCount > 0) add('견본', '견본 미리보기를 보고 승인');
        else if (mine.some((a) => a.dispatchStatus === 'awaiting_user_execution_approval')) add('실행', 'PM 계획을 보고 작업별 실행 승인');
        if (mine.some((a) => a.dispatchStatus === 'ready')) add('개발', '실행 승인된 작업 시작(Codex 지시서 넘기기 등)');
        break;
      case 'executing':
        if (mine.some((a) => a.dispatchStatus === 'ready')) add('개발', '실행 승인된 작업 시작(Codex 지시서 넘기기 등)');
        break;
      case 'result_review':
      case 'github_approval_pending':
        add('결과', '결과를 보고 올리기 승인하거나 수정 요청', canApprove(v, 'B').ok ? 'B' : undefined);
        break;
      case 'deployment_approval_pending':
        if (prCheckPasses(latestPrCheck(t, all))) add('배포', 'CI 통과. 배포 승인');
        break;
      case 'failed':
      case 'integration_blocked':
      case 'rate_limited':
        add('막힘', '막힌 이유를 확인해 주세요');
        break;
      default:
        break;
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
