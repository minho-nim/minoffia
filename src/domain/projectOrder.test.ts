import { describe, expect, it } from 'vitest';
import { moveProject, orderProjects } from './projectOrder';

const p = (id: string, position: number | undefined, createdAt: string) => ({ id, name: id, repo: null, description: '', createdAt, position }) as never;

describe('프로젝트 순서(v0.6.42)', () => {
  it('순서 칸, 같으면 만든 순서', () => {
    expect(orderProjects([p('b', 1, '2'), p('a', 0, '3'), p('c', 1, '1')]).map((x: { id: string }) => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('한 칸 옮기기, 끝에서는 그대로', () => {
    const list = [p('a', 0, '1'), p('b', 1, '2'), p('c', 2, '3')];
    expect(moveProject(list, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveProject(list, 'a', -1)).toEqual(['a', 'b', 'c']);
  });
});
