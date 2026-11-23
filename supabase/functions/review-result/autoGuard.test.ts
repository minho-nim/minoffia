import { describe, expect, it } from 'vitest';
import { guardRedo, oneWayChanges } from './autoGuard';

describe('자동 다시 개발 막기(v0.8.8)', () => {
  it('되돌리기 어려운 변경 찾기', () => {
    expect(oneWayChanges('diff --git a/supabase/migrations/0070_x.sql b/supabase/migrations/0070_x.sql\n+create table x ()')).toEqual(['DB 마이그레이션']);
    expect(oneWayChanges('diff --git a/src/a.ts b/src/a.ts\n+const a = 1;')).toEqual([]);
    expect(oneWayChanges('+  create policy p on t for select using (true);')).toEqual(['DB 권한(RLS·GRANT)']);
    expect(oneWayChanges('diff --git a/.github/workflows/x.yml b/.github/workflows/x.yml')).toEqual(['배포·자동 작업 설정']);
  });
  it('다시 개발 → 사장님 확인으로(그 밖은 그대로)', () => {
    const redo = { verdict: 'redo', reasons: ['점수 70점'] };
    expect(guardRedo(redo, 'diff --git a/supabase/migrations/0070_x.sql b/x')).toMatchObject({ verdict: 'owner' });
    expect(guardRedo(redo, 'diff --git a/src/a.ts b/src/a.ts')).toBe(redo);
    const pass = { verdict: 'pass', reasons: [] };
    expect(guardRedo(pass, 'diff --git a/supabase/migrations/0070_x.sql b/x')).toBe(pass);
  });
});
