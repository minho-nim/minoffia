/**
 * "내 차례" 목록: 사용자가 손대야 하는 일(승인·답·시작)만 업무 단계로 모은다(규칙만).
 * 이름은 "그때 내가 보는 것": 기획(기획서)·계획(PM 계획 → 실행 승인)·견본·시작(실행 승인된 작업 시작)·결과·배포·질문.
 * 사무실 말풍선의 ?와 같은 기준이다. 바로 끝낼 수 있는 승인(A·B)은 quick으로 표시한다.
 */
import type { Task } from './types';
import { canApprove, deriveWorkflow, latestPrCheck, prCheckPasses } from './workflow';
import type { WorkflowData } from './workflow-types';
import { stalls } from './stall';

export interface MyTurn {
  taskId: string;
  title: string;
  /** 단계 이름(기획·실행·견본·개발·결과·배포·질문) */
  word: string;
  /** 할 일 한 줄 */
  label: string;
  /** 목록에서 바로 누를 수 있는 승인. 없으면 업무 카드에서 */
  quick?: 'A' | 'B';
  /** 막힘·멈춤([!]): 맨 위에 빨갛게 */
  alert?: boolean;
  /** 정렬용(오래 기다린 것부터) */
  at: string;
}

export function myTurns(tasks: Task[], all: WorkflowData, now: number = Date.now()): MyTurn[] {
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
        else if (mine.some((a) => a.dispatchStatus === 'awaiting_user_execution_approval')) add('계획', 'PM 계획을 보고 작업별 실행 승인');
        if (mine.some((a) => a.dispatchStatus === 'ready')) add('시작', '실행 승인된 작업 시작(Codex 지시서 넘기기 등)');
        break;
      case 'executing':
        if (mine.some((a) => a.dispatchStatus === 'ready')) add('시작', '실행 승인된 작업 시작(Codex 지시서 넘기기 등)');
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
        out.push({ taskId: t.id, title: t.title, word: '막힘', label: '막힌 이유를 확인해 주세요', alert: true, at: t.updatedAt });
        break;
      default:
        break;
    }
  }
  // 자동으로 넘어가야 할 단계가 너무 오래 그대로면(멈춤) [!]로 알린다(v0.4.10).
  const title = new Map(tasks.map((t) => [t.id, t.title]));
  for (const s of stalls(tasks, all, now)) out.push({ taskId: s.taskId, title: title.get(s.taskId) ?? '', word: s.word, label: s.label, alert: true, at: s.since });
  return out.sort((a, b) => Number(!!b.alert) - Number(!!a.alert) || a.at.localeCompare(b.at));
}
