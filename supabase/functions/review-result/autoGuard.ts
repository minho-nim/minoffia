// 자동 다시 개발 막기(v0.8.8 소유자 "1 ㄱ": 평가가 고칠 곳을 내면 자동으로 최대 2번, 단 되돌리기 어려운 변경은 사람에게):
// 결과 변경에 DB 마이그레이션·권한(RLS·GRANT)·서버 비밀값·배포 설정이 들어 있으면 자동으로 다시 맡기지 않고 소유자 확인으로 돌린다.
const ONE_WAY: [RegExp, string][] = [
  [/^diff --git a\/supabase\/migrations\//m, 'DB 마이그레이션'],
  [/^\+.*\b(create|alter|drop)\s+policy\b|^\+.*\b(grant|revoke)\b.*\bon\b/im, 'DB 권한(RLS·GRANT)'],
  [/^diff --git a\/\.github\/workflows\//m, '배포·자동 작업 설정'],
  [/^\+.*\b(Deno\.env\.get|process\.env)\(?['"][A-Z_]*(KEY|TOKEN|SECRET)/m, '서버 비밀값 사용'],
];

/** 되돌리기 어려운 변경 이름들(없으면 빈 목록) */
export function oneWayChanges(diff: string): string[] {
  return ONE_WAY.filter(([re]) => re.test(diff ?? '')).map(([, name]) => name);
}

/** 자동 다시 개발 판정을 소유자 확인으로 바꿀지 */
export function guardRedo<T extends { verdict: string; reasons: string[] }>(out: T, diff: string): T {
  if (out.verdict !== 'redo') return out;
  const hit = oneWayChanges(diff);
  if (!hit.length) return out;
  return { ...out, verdict: 'owner', reasons: [...out.reasons, `${hit.join('·')} 변경이 있어 자동으로 다시 맡기지 않았어요(사장님 확인)`] };
}
