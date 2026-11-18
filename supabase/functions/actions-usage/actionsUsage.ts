// GitHub Actions 사용량 계산(v0.7.93 소유자 "통계에 깃허브 액션도"): 서버가 읽은 실행 기록 → 화면에 보낼 줄.
// GitHub는 공개 저장소의 Actions를 무료·무제한으로 돌리고, 비공개 저장소만 한 달 2,000분 한도에 든다(작업마다 분 단위로 올려 셈).

export interface GhRun {
  id: number;
  name: string | null;
  status: string;
  conclusion: string | null;
  created_at: string;
  run_started_at?: string | null;
  updated_at: string;
}
export interface GhJob {
  started_at: string | null;
  completed_at: string | null;
}
export interface ActionRun {
  repo: string;
  private: boolean;
  workflow: string;
  ok: boolean;
  createdAt: string;
  /** 실행 분: 비공개는 작업(job)마다 올림해 더한 청구 분, 공개는 실행 시간 올림(무료) */
  minutes: number;
}

const ceilMin = (ms: number) => (ms > 0 ? Math.ceil(ms / 60_000) : 0);

/** 실행 하나의 분(공개 저장소용): 시작~마지막 갱신, 올림 */
export function runMinutes(r: GhRun): number {
  if (r.status !== 'completed') return 0;
  return ceilMin(Date.parse(r.updated_at) - Date.parse(r.run_started_at || r.created_at));
}

/** 작업마다 올림해 더한 분(GitHub 청구 방식) */
export function jobMinutes(jobs: GhJob[]): number {
  return jobs.reduce((a, j) => (j.started_at && j.completed_at ? a + ceilMin(Date.parse(j.completed_at) - Date.parse(j.started_at)) : a), 0);
}

/** 화면에 보일 일 이름: 워크플로 이름(영어는 쉬운 말로) */
const NAME: Record<string, string> = { verify: 'PR 검사(verify)', 'UI 코드 검사': 'UI 코드 검사' };
export function workflowLabel(name: string | null): string {
  const n = (name ?? '').trim();
  return NAME[n] ?? (n || '이름 없는 실행');
}

/** 읽을 저장소: 미노피아·스킬·노트 + 프로젝트 저장소. minho-nim/MinLab은 건드리지 않는다 */
export function reposToRead(projectRepos: (string | null)[]): string[] {
  const set = new Set(['minho-nim/minoffia', 'minho-nim/minoffia-skills', 'minho-nim/minoffia-notes']);
  for (const r of projectRepos) if (r && /^[\w.-]+\/[\w.-]+$/.test(r)) set.add(r);
  return [...set].filter((r) => r.toLowerCase() !== 'minho-nim/minlab');
}
