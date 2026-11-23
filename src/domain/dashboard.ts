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

/** 이번 주(최근 7일)와 지난주(그 앞 7일) 수 */
export function weekCompare(dates: string[], now: number = Date.now()): { now: number; prev: number } {
  let a = 0;
  let b = 0;
  for (const d of dates) {
    const age = now - Date.parse(d);
    if (age < 0) continue;
    if (age <= WEEK) a++;
    else if (age <= 2 * WEEK) b++;
  }
  return { now: a, prev: b };
}

/** '지난주보다 +2' · '지난주와 같아요' */
export function deltaText(c: { now: number; prev: number }): string {
  const d = c.now - c.prev;
  return d === 0 ? '지난주와 같아요' : `지난주보다 ${d > 0 ? '+' : ''}${d}`;
}

export interface CalDay {
  /** YYYY-MM-DD(한국 시각) */
  day: string;
  /** 달력의 이번 달 날인지(앞뒤 빈칸 false) */
  inMonth: boolean;
  created: number;
  deployed: number;
}

const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);

/** 이번 달 활동 달력(일~토 줄, 앞뒤 빈칸 포함): 날마다 접수·배포 수 */
export function monthCalendar(tasks: { createdAt: string; sample?: boolean }[], deploys: { ok: boolean; createdAt: string }[], now: number = Date.now()): CalDay[][] {
  const today = new Date(now + 9 * 3600_000);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const count = (list: string[]) => {
    const c = new Map<string, number>();
    for (const iso of list) c.set(kstDay(iso), (c.get(kstDay(iso)) ?? 0) + 1);
    return c;
  };
  const created = count(tasks.filter((t) => !t.sample).map((t) => t.createdAt));
  const deployed = count(deploys.filter((d) => d.ok).map((d) => d.createdAt));
  const cells: CalDay[] = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push({ day: '', inMonth: false, created: 0, deployed: 0 });
  for (let d = 1; d <= days; d++) {
    const day = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
    cells.push({ day, inMonth: true, created: created.get(day) ?? 0, deployed: deployed.get(day) ?? 0 });
  }
  while (cells.length % 7) cells.push({ day: '', inMonth: false, created: 0, deployed: 0 });
  const weeks: CalDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface Routine {
  name: string;
  at: string | null;
  ok: boolean | null;
  /** 오래 안 돌았거나 실패면 표시 */
  note: string;
}

/** 자동 작업: 미노피아가 스스로 돌리는 Actions(저장소 minoffia·notes·skills)의 이름별 마지막 실행 + 옵시디언 노트 */
export function routines(actions: { repo: string; workflow: string; ok: boolean; createdAt: string }[], brainAt: string | null, now: number = Date.now()): Routine[] {
  const own = actions.filter((a) => /^minho-nim\/(minoffia|minoffia-notes|minoffia-skills|minlab-ai-office)$/i.test(a.repo));
  const last = new Map<string, { at: string; ok: boolean }>();
  for (const a of own) {
    const cur = last.get(a.workflow);
    if (!cur || a.createdAt > cur.at) last.set(a.workflow, { at: a.createdAt, ok: a.ok });
  }
  const out: Routine[] = [...last.entries()].map(([name, v]) => ({ name, at: v.at, ok: v.ok, note: v.ok ? '' : '실패' }));
  const brainAge = brainAt ? now - Date.parse(brainAt) : Infinity;
  out.push({ name: '옵시디언 노트 보내기', at: brainAt, ok: brainAt ? true : null, note: brainAge > 2 * 86400_000 ? '이틀 넘게 안 보냄' : '' });
  return out.sort((a, b) => Number(a.ok !== false) - Number(b.ok !== false) || (b.at ?? '').localeCompare(a.at ?? ''));
}

/** 오래된 자료면 true(기본 10분) */
export const stale = (iso: string | null | undefined, now: number = Date.now(), ms = 10 * 60_000) => !iso || now - Date.parse(iso) > ms;
