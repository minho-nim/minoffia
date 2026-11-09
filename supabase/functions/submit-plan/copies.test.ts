import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const norm = (s: string) =>
  s
    .replace(/from '\.\/(difficulty|planTypes|smallTask|workflow-types)(\.ts)?';/g, "from './X';")
    .trim();

describe('submit-plan 복사본(v0.6.11): 앱의 계획 검사·@이름 규칙과 같다', () => {
  it('pmPlan·difficulty·mention은 가져오는 경로만 다르다', () => {
    for (const f of ['pmPlan', 'difficulty', 'mention']) {
      expect(norm(readFileSync(`supabase/functions/submit-plan/${f}.ts`, 'utf8'))).toBe(norm(readFileSync(`src/domain/${f}.ts`, 'utf8')));
    }
  });
  it('계획 타입·OFFICE_REPOS·REASSIGN_MARK가 앱과 같다', () => {
    const types = readFileSync('supabase/functions/submit-plan/planTypes.ts', 'utf8');
    const app = readFileSync('src/domain/workflow-types.ts', 'utf8');
    for (const block of types.split(/\n(?=export )/).filter((b) => /^export (type|interface) /.test(b))) expect(app).toContain(block.trim());
    const repos = /export const OFFICE_REPOS = \[[^\]]*\];/;
    expect(types.match(repos)?.[0]).toBe(readFileSync('src/domain/smallTask.ts', 'utf8').match(repos)?.[0]);
    const mark = /export const REASSIGN_MARK = '[^']*';/;
    expect(readFileSync('supabase/functions/submit-plan/importPlan.ts', 'utf8').match(mark)?.[0]).toBe(readFileSync('src/domain/reassign.ts', 'utf8').match(mark)?.[0]);
  });
});
