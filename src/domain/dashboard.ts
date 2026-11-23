/**
 * 대시보드 숫자(v0.8.6 소유자 "대시보드, 중요한 순, 원 그래프가 나으면 바꿔도"): 이미 가진 기록만 센다(새 데이터·모델 0).
 * 중요한 순서: 지금 할 일(막힘 먼저) → 일하는 중 → 사용량 → 업무 상태 → 서비스 → 프로젝트.
 */
import type { Project, Task } from './types';
import type { WorkflowData } from './workflow-types';
import type { MyTurn } from './myTurn';

const WEEK = 7 * 86400_000;

export interface DashProject {
  id: string;
  name: string;
  turn: number;
  working: number;
  open: number;
  lastDeploy: string | null;
}

export interface Dash {
  turns: MyTurn[];
  alerts: number;
  working: Task[];
  blocked: Task[];
  deploysWeek: number;
  lastDeploy: string | null;
  /** 열린 업무 상태별(원 그래프) */
  status: { key: 'queued' | 'in_progress' | 'review' | 'blocked'; label: string; n: number }[];
  doneWeek: number;
  projects: DashProject[];
}

export function dashboard(tasks: Task[], w: WorkflowData, turns: MyTurn[], projects: Project[], now: number = Date.now()): Dash {
  // 예시(데모) 업무만 있으면 예시도 센다(실제 업무가 하나라도 있으면 예시는 뺀다)
  const real = tasks.some((t) => !t.sample) ? tasks.filter((t) => !t.sample) : tasks;
  const okDeploys = w.deployments.filter((d) => d.ok).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sorted = [...turns].sort((a, b) => Number(Boolean(b.alert)) - Number(Boolean(a.alert)));
  const projOf = new Map(tasks.map((t) => [t.id, t.projectId]));
  const lastBy = new Map<string, string>();
  for (const d of okDeploys) {
    const pid = projOf.get(d.taskId);
    if (pid && !lastBy.has(pid)) lastBy.set(pid, d.createdAt);
  }
  const doneWeek = w.approvals.filter((a) => a.gate === 'C' && a.decision === 'approved' && now - Date.parse(a.createdAt) <= WEEK).length;
  const count = (s: Task['status']) => real.filter((t) => t.status === s).length;
  return {
    turns: sorted,
    alerts: sorted.filter((t) => t.alert).length,
    working: real.filter((t) => t.status === 'in_progress'),
    blocked: real.filter((t) => t.status === 'blocked' || t.dispatch?.state === 'failed'),
    deploysWeek: okDeploys.filter((d) => now - Date.parse(d.createdAt) <= WEEK).length,
    lastDeploy: okDeploys[0]?.createdAt ?? null,
    status: [
      { key: 'queued', label: '대기', n: count('queued') },
      { key: 'in_progress', label: '진행', n: count('in_progress') },
      { key: 'review', label: '검토', n: count('review') },
      { key: 'blocked', label: '막힘', n: count('blocked') },
    ],
    doneWeek,
    projects: (projects.some((p) => !p.sample) ? projects.filter((p) => !p.sample) : projects)
      .map((p) => {
        const mine = real.filter((t) => t.projectId === p.id);
        const turn = turns.filter((t) => projOf.get(t.taskId) === p.id).length;
        return { id: p.id, name: p.name, turn, working: mine.filter((t) => t.status === 'in_progress').length, open: mine.filter((t) => t.status !== 'done').length, lastDeploy: lastBy.get(p.id) ?? null };
      })
      // 중요한 순: 내 차례 → 진행 → 열린 업무 → 최근 배포
      .sort((a, b) => b.turn - a.turn || b.working - a.working || b.open - a.open || (b.lastDeploy ?? '').localeCompare(a.lastDeploy ?? '')),
  };
}

/** '3분 전'·'2시간 전'·'4일 전'·날짜 */
export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '-';
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m}분 전`;
  if (m < 24 * 60) return `${Math.round(m / 60)}시간 전`;
  if (m < 14 * 24 * 60) return `${Math.round(m / 1440)}일 전`;
  return iso.slice(5, 10).replace('-', '/');
}
