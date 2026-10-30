// PR 주소 읽기와 CI(GitHub Actions 실행) 요약(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).

export type CiState = 'success' | 'failure' | 'pending' | 'none';

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

/** https://github.com/<owner>/<repo>/pull/<번호> 만 받는다. */
export function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

/** 하나라도 진행 중이면 pending, 실패·취소·시간 초과가 있으면 failure, 전부 성공(건너뜀 포함)이면 success, 없으면 none */
export function summarizeChecks(runs: CheckRun[]): CiState {
  if (runs.length === 0) return 'none';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  const ok = ['success', 'skipped', 'neutral'];
  return runs.every((r) => ok.includes(r.conclusion ?? '')) ? 'success' : 'failure';
}
