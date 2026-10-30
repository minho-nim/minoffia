// 운영 배포(release 앞당기기) 판단(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).
// GitHub compare API의 status: base...head 기준 'ahead'(head가 앞섬) · 'behind' · 'identical' · 'diverged'.

export interface DeployFacts {
  /** release...main 비교 */
  releaseToMain: string;
  /** PR 병합 커밋...main 비교(병합 커밋이 main에 들어 있으면 ahead 또는 identical) */
  mergeToMain: string;
}

export type DeployDecision = { action: 'update' } | { action: 'noop' } | { action: 'refuse'; reason: string };

export function decideDeploy(f: DeployFacts): DeployDecision {
  if (f.mergeToMain !== 'ahead' && f.mergeToMain !== 'identical') {
    return { action: 'refuse', reason: '이 PR의 병합 커밋이 main에 없습니다.' };
  }
  if (f.releaseToMain === 'identical') return { action: 'noop' };
  if (f.releaseToMain === 'ahead') return { action: 'update' };
  // release에만 있는 커밋이 있으면(직접 커밋 등) 덮어쓰지 않는다.
  return { action: 'refuse', reason: `release가 main과 갈라져 있어(${f.releaseToMain}) 앞당길 수 없습니다. release에 직접 올린 커밋이 있는지 확인하세요.` };
}

/** pr-status/summary.ts와 같은 규칙(함수마다 따로 배포되므로 복사해 둔다. 같은지는 시험이 확인한다). */
export function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}
