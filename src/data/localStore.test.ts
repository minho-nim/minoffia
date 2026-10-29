import { describe, expect, it } from 'vitest';
import { createLocalStore } from './localStore';

describe('localStore', () => {
  it('프로젝트를 수정하면 같은 자리에서 바뀌고 업무는 그대로 남는다', async () => {
    const store = createLocalStore();
    const before = await store.load();
    const target = before.projects[0];
    const taskCount = before.tasks.filter((t) => t.projectId === target.id).length;

    await store.saveProject({ ...target, repo: 'minho-nim/MinLab-AI-Office' });
    const after = await store.load();

    expect(after.projects).toHaveLength(before.projects.length);
    expect(after.projects[0]).toMatchObject({ id: target.id, repo: 'minho-nim/MinLab-AI-Office' });
    expect(after.tasks.filter((t) => t.projectId === target.id)).toHaveLength(taskCount);
  });
});
