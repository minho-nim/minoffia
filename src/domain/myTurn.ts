/**
 * "내 차례" 목록: 사용자가 손대야 하는 일(승인·답·시작)만 업무 단계로 모은다(규칙만).
 * 이름은 "그때 내가 보는 것": 기획(기획서)·계획(PM 계획 → 실행 승인)·견본·시작(실행 승인된 작업 시작)·결과·배포·질문.
 * 사무실 말풍선의 ?와 같은 기준이다. 바로 끝낼 수 있는 승인(A·B)은 quick으로 표시한다.
 */
import type { Task } from './types';
import { canApprove, deriveWorkflow, latestDeployment, latestPrCheck, prCheckPasses } from './workflow';
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
  /** 업무 카드에서 바로 갈 칸(v0.4.86): qa 확인 질문, pm 계획 보내기, A 기획 승인, P 견본, E 실행, B 결과, C 배포 */
  step?: TurnStep;
}

export type TurnStep = 'qa' | 'pm' | 'A' | 'P' | 'E' | 'B' | 'C';

/** 끝에 가까운 단계일수록 앞(배포 → 올리기 → 실행·견본 → 계획 → 기획 → 질문) */
const STEP_RANK: Record<TurnStep, number> = { C: 0, B: 1, E: 2, P: 2, pm: 3, A: 4, qa: 5 };
const stepRank = (s?: TurnStep) => (s ? STEP_RANK[s] : 6);
/** 내 차례 정렬 */
export const turnOrder = (a: MyTurn, b: MyTurn) => Number(!!b.alert) - Number(!!a.alert) || stepRank(a.step) - stepRank(b.step) || a.at.localeCompare(b.at);

export function myTurns(tasks: Task[], all: WorkflowData, now: number = Date.now()): MyTurn[] {
  const out: MyTurn[] = [];
  for (const t of tasks) {
    const v = deriveWorkflow(t, all);
    // 배포 승인 뒤 배포가 안 됐으면(확인 필요·실패) 끝난 업무여도 내 차례에 남긴다(v0.4.20).
    if (v.cApproved) {
      const d = latestDeployment(t, all);
      if (d && !d.ok) out.push({ taskId: t.id, title: t.title, word: '배포', label: d.error.startsWith('확인 필요') ? '같이 나갈 변경이 있어요. 확인하고 배포해 주세요' : '배포가 안 됐어요. 이유를 확인해 주세요', alert: true, at: d.createdAt });
      continue;
    }
    if (t.status === 'done') continue;
    const add = (word: string, label: string, quick?: 'A' | 'B', step?: TurnStep) => out.push({ taskId: t.id, title: t.title, word, label, quick, at: t.updatedAt, step });
    const mine = v.plan ? all.assignments.filter((a) => a.taskId === t.id && a.planRevision === v.plan!.planRevision) : [];
    switch (v.stage) {
      case 'needs_clarification':
        add('질문', '확인 질문에 답해 주세요(입력창이나 업무 카드)', undefined, 'qa');
        break;
      case 'pm_queued':
        // 기획 승인·수정 요청 뒤 PM에 자동으로 못 보낸 경우(저장소 없음 등)
        add('계획', 'PM에 보내 주세요(저장소가 없으면 프로젝트에 저장소부터 연결)', undefined, 'pm');
        break;
      case 'spec_ready':
      case 'development_approval_pending':
        add('기획', '기획서를 보고 승인하거나 수정 요청', canApprove(v, 'A').ok ? 'A' : undefined, 'A');
        break;
      case 'agent_handoff_pending':
        if (v.prototypeFirst && !v.pApproved && v.prototypeCount > 0) add('견본', '견본 미리보기를 보고 승인', undefined, 'P');
        else if (mine.some((a) => a.dispatchStatus === 'awaiting_user_execution_approval')) add('계획', 'PM 계획을 보고 작업별 실행 승인', undefined, 'E');
        if (mine.some((a) => a.dispatchStatus === 'ready')) add('시작', '실행 승인된 작업 시작(Codex 지시서 넘기기 등)', undefined, 'E');
        break;
      case 'executing':
        if (mine.some((a) => a.dispatchStatus === 'ready')) add('시작', '실행 승인된 작업 시작(Codex 지시서 넘기기 등)', undefined, 'E');
        break;
      case 'result_review':
      case 'github_approval_pending':
        add('결과', '결과를 보고 올리기 승인하거나 수정 요청', canApprove(v, 'B').ok ? 'B' : undefined, 'B');
        break;
      case 'deployment_approval_pending':
        if (prCheckPasses(latestPrCheck(t, all))) add('배포', 'CI 통과. 배포 승인', undefined, 'C');
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
  // 막힘 먼저, 그다음 끝에 가까운 단계부터(시작한 일부터 끝내기, v0.5.45 Task Master의 다음 작업 고르기에서 착안), 같으면 오래 기다린 것부터
  return out.sort(turnOrder);
}
