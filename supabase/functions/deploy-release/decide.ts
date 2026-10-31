// 운영 배포(release 앞당기기) 판단(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).
// GitHub compare API의 status: base...head 기준 'ahead'(head가 앞섬) · 'behind' · 'identical' · 'diverged'.

export interface DeployFacts {
  /** release...main 비교 */
  releaseToMain: string;
  /** PR 병합 커밋...main 비교(병합 커밋이 main에 들어 있으면 ahead 또는 identical) */
  mergeToMain: string;
  /** 병합 커밋 뒤 main에 더 들어간 커밋 수(mergeToMain이 ahead일 때) */
  extraCommits?: number;
  /** main 최신 커밋의 시험(CI): 없으면 'none' */
  mainCi?: 'success' | 'failure' | 'pending' | 'none';
  /** 사용자가 "같이 나갈 변경"을 보고 그래도 배포한다고 했는가 */
  allowExtra?: boolean;
}

export type DeployDecision =
  | { action: 'update' }
  | { action: 'noop' }
  | { action: 'refuse'; reason: string }
  /** 이 업무 말고 다른 변경도 같이 나간다: 사용자 확인 필요(v0.4.20) */
  | { action: 'confirm'; reason: string; extra: number }
  /** main 시험이 아직 진행 중: 잠시 뒤 다시(앱이 자동으로 다시 시도) */
  | { action: 'wait'; reason: string };

export function decideDeploy(f: DeployFacts): DeployDecision {
  if (f.mergeToMain !== 'ahead' && f.mergeToMain !== 'identical') {
    return { action: 'refuse', reason: '이 PR의 병합 커밋이 main에 없습니다.' };
  }
  if (f.releaseToMain === 'identical') return { action: 'noop' };
  if (f.releaseToMain !== 'ahead') {
    // release에만 있는 커밋이 있으면(직접 커밋 등) 덮어쓰지 않는다.
    return { action: 'refuse', reason: `release가 main과 갈라져 있어(${f.releaseToMain}) 앞당길 수 없습니다. release에 직접 올린 커밋이 있는지 확인하세요.` };
  }
  // v0.4.20: 이 업무의 병합 뒤 main에 다른 변경이 더 있으면 같이 배포되므로 확인을 받는다.
  if (f.mergeToMain === 'ahead' && !f.allowExtra) {
    const n = f.extraCommits ?? 0;
    return { action: 'confirm', extra: n, reason: `확인 필요: 이 업무 말고 main에 들어간 변경 ${n || '몇'}개가 같이 배포됩니다.` };
  }
  // 합친 뒤의 main을 시험한 결과를 본다(각 PR은 옛 main 기준으로만 시험했으므로).
  if (f.mainCi === 'failure') return { action: 'refuse', reason: 'main 시험(CI)이 실패했습니다. 고친 뒤 다시 배포하세요.' };
  if (f.mainCi === 'pending') return { action: 'wait', reason: 'main 시험(CI)이 끝나면 자동으로 배포해요.' };
  return { action: 'update' };
}

/** pr-status/summary.ts와 같은 규칙(함수마다 따로 배포되므로 복사해 둔다. 같은지는 시험이 확인한다). */
export function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = url.trim().match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}
