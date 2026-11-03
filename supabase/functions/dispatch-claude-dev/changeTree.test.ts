import { describe, expect, it } from 'vitest';
// @ts-expect-error 워크플로용 .mjs 스크립트(타입 없음)
import { changeTree, parseNumstat } from '../../../scripts/change-tree.mjs';

describe('바뀐 곳 구조도(v0.5.21, Archify tree JSON)', () => {
  it('numstat을 읽고 폴더마다 바뀐 줄을 더한다', () => {
    const files = parseNumstat('3\t1\tsrc/a.ts\n10\t0\tsrc/ui/b.tsx\n-\t-\tlogo.png\n');
    expect(files).toEqual([
      { path: 'src/a.ts', add: 3, del: 1 },
      { path: 'src/ui/b.tsx', add: 10, del: 0 },
      { path: 'logo.png', add: 0, del: 0 },
    ]);
    const t = changeTree(files, 'me/app');
    expect(t.diagram_type).toBe('tree');
    expect(t.nodes[0]).toMatchObject({ id: 'root', label: 'me/app', sublabel: '바뀐 파일 3개 · +13 −1' });
    const src = t.nodes.find((n: { label: string }) => n.label === 'src/');
    expect(src).toMatchObject({ parent: 'root', sublabel: '2개 · +13 −1' });
    expect(t.nodes.find((n: { label: string }) => n.label === 'ui/')).toMatchObject({ parent: src.id });
    for (const n of t.nodes) expect(n.id).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
  });

  it('파일이 많으면 40개만 그리고 나머지는 개수로', () => {
    const files = Array.from({ length: 45 }, (_, i) => ({ path: `f${i}.ts`, add: 1, del: 0 }));
    const t = changeTree(files, 'me/app');
    expect(t.nodes.filter((n: { parent?: string }) => n.parent === 'root')).toHaveLength(41);
    expect(t.nodes.at(-1).label).toBe('외 5개');
  });
});
