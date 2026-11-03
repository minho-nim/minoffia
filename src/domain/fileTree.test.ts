import { describe, expect, it } from 'vitest';
import { buildTree, diffStats, projectChanges } from './fileTree';
import type { Task } from './types';
import type { ResultPackage } from './workflow-types';

const diff = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@\n+x\n+y\n-z\ndiff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@\n+r\n';

describe('구조도(v0.5.24)', () => {
  it('diff에서 파일마다 +/− 줄 수', () => {
    expect(diffStats(diff)).toEqual([
      { path: 'src/a.ts', add: 2, del: 1 },
      { path: 'README.md', add: 1, del: 0 },
    ]);
  });

  it('끝나지 않은 업무의 최신 결과만 모은다(Codex·Claude·Gemini 결과 모두 diff로)', () => {
    const t = (id: string, status: Task['status']) => ({ id, projectId: 'p', title: `업무 ${id}`, status }) as Task;
    const r = (taskId: string, revision: number, d: string) => ({ taskId, revision, diff: d }) as ResultPackage;
    const m = projectChanges('p', [t('1', 'in_progress'), t('2', 'done')], [r('1', 1, 'diff --git a/old.ts b/old.ts\n+o\n'), r('1', 2, diff), r('2', 1, diff)]);
    expect([...m.keys()]).toEqual(['src/a.ts', 'README.md']);
    expect(m.get('src/a.ts')).toEqual({ add: 2, del: 1, tasks: ['업무 1'] });
  });

  it('폴더 먼저 이름순, 바뀐 파일 수를 위로 더하고, 목록에 없던 새 파일도 넣는다', () => {
    const changes = new Map([['src/new.ts', { add: 3, del: 0, tasks: ['t'] }]]);
    const root = buildTree(['README.md', 'src/b.ts', 'src/a.ts'], changes);
    expect(root.children.map((c) => c.name)).toEqual(['src', 'README.md']);
    expect(root.children[0].children.map((c) => c.name)).toEqual(['a.ts', 'b.ts', 'new.ts']);
    expect(root.changed).toBe(1);
    expect(root.children[0].changed).toBe(1);
    expect(root.children[0].children[2].change?.add).toBe(3);
  });
});
