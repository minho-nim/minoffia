import { describe, expect, it } from 'vitest';
import type { ResultReview } from './workflow-types';
import { repeatIssues } from './repeatIssues';

const review = (taskId: string, rev: number, violations: string[], fixes: string[] = []) =>
  ({ taskId, resultRevision: rev, score: { violations, fixes } } as unknown as ResultReview);

describe('반복되는 문제', () => {
  const tasks = [{ id: 't1', projectId: 'p1' }, { id: 't2', projectId: 'p1' }, { id: 't3', projectId: 'p2' }];
  it('서로 다른 결과 2번 이상 나온 것만, 글자 차이는 무시하고 모은다', () => {
    const got = repeatIssues([review('t1', 1, ['휴대폰 폭 가로 넘침']), review('t2', 1, [], ['휴대폰 폭 가로넘침.']), review('t3', 1, ['휴대폰 폭 가로 넘침'])], tasks, 'p1');
    expect(got).toEqual([{ text: '휴대폰 폭 가로 넘침', count: 2 }]);
  });
  it('같은 결과 안에서 두 번 나온 것과 이미 규칙에 있는 것은 빼고 센다', () => {
    expect(repeatIssues([review('t1', 1, ['색 대비 부족'], ['색 대비 부족'])], tasks, 'p1')).toEqual([]);
    expect(repeatIssues([review('t1', 1, ['색 대비 부족']), review('t2', 1, ['색 대비 부족'])], tasks, 'p1', ['색 대비 부족'])).toEqual([]);
  });
});
