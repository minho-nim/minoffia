import { describe, expect, it } from 'vitest';
import { archifyPath, changeTree, statsFromDiff } from './tree';

const diff = ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1,2 @@', '-old', '+new', '+more', 'diff --git a/README.md b/README.md', '+++ b/README.md', '+x'].join('\n');

describe('Archify 재료', () => {
  it('diff에서 파일별 +/−를 센다(머리 줄은 빼고)', () => {
    expect(statsFromDiff(diff)).toEqual([{ path: 'src/a.ts', add: 2, del: 1 }, { path: 'README.md', add: 1, del: 0 }]);
  });
  it('폴더 → 파일 나무를 만든다', () => {
    const t = changeTree(statsFromDiff(diff), 'o/r');
    expect(t.nodes[0]).toMatchObject({ id: 'root', label: 'o/r', sublabel: '바뀐 파일 2개 · +3 −1' });
    expect(t.nodes.map((n) => n.label)).toEqual(['o/r', 'src/', 'a.ts', 'README.md']);
  });
  it('저장 위치는 소유자 폴더 아래', () => {
    expect(archifyPath('u1', 't1', 2)).toBe('u1/t1/archify-r2.html');
  });
});
