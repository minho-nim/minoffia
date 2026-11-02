import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPO_MAP_SCRIPT, repoMapStep } from '../../../src/domain/devHabits';

describe('개발 습관·저장소 지도(v0.4.96)', () => {
  it('서버 함수 3곳은 같은 파일을 쓴다', () => {
    const app = readFileSync('src/domain/devHabits.ts', 'utf8');
    for (const f of ['dispatch-claude', 'dispatch-claude-dev', 'dispatch-gemini-dev']) expect(readFileSync(`supabase/functions/${f}/devHabits.ts`, 'utf8')).toBe(app);
  });
  it('지도 스크립트는 scripts/repo-map.mjs와 같다', () => {
    expect(REPO_MAP_SCRIPT).toBe(readFileSync('scripts/repo-map.mjs', 'utf8').trim());
    expect(repoMapStep().join('\n')).toContain("<<'MAPEOF'");
  });
  it('이 저장소에서 돌리면 이미 있는 것을 짧게 보여 준다', () => {
    const out = execFileSync('node', ['scripts/repo-map.mjs'], { encoding: 'utf8' });
    expect(out).toContain('src/domain/:');
    expect(out).toContain('BASE_RULES');
    expect(out.length).toBeLessThanOrEqual(2600);
    expect(out).not.toMatch(/\.test\./);
  });
});
