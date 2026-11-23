import { describe, expect, it } from 'vitest';
import { repeatedWork, skillRequest } from './repeatWork';
import type { Task } from './types';

const T = (id: string, title: string, day: number, projectId = 'p'): Task => ({ id, title, projectId, createdAt: `2026-11-${String(day).padStart(2, '0')}T01:00:00Z` }) as unknown as Task;
const now = new Date('2026-11-23T00:00:00Z');

describe('같은 일 여러 번 → 스킬 제안(v0.8.5)', () => {
  const tasks = [
    T('1', '휴대폰 400px 화면 확인해줘', 3),
    T('2', '휴대폰 400px 화면 가로 넘침 확인', 8),
    T('3', '로그인 버튼 색 바꾸기', 9),
    T('4', '휴대폰 400px 화면 확인 좀 해줘', 15, 'q'),
    T('5', 'README 출처 정리', 16),
    T('6', '오래된 일: 휴대폰 400px 화면 확인', 1),
  ];
  it('최근 30일 비슷한 업무 3번 이상을 묶는다', () => {
    const g = repeatedWork(tasks, now);
    expect(g).toHaveLength(1);
    expect(g[0].tasks.map((t) => t.id)).toEqual(['6', '1', '2', '4']);
    expect(g[0].title).toBe('휴대폰 400px 화면 확인해줘');
  });
  it('괜찮아요 한 묶음은 다시 안 보인다', () => {
    const [g] = repeatedWork(tasks, now);
    expect(repeatedWork(tasks, now, [g.key])).toEqual([]);
  });
  it('3번 미만·다른 일은 묶지 않는다', () => {
    expect(repeatedWork(tasks.slice(0, 3), now)).toEqual([]);
  });
  it('스킬 만들기 요청 글', () => {
    const [g] = repeatedWork(tasks, now);
    const text = skillRequest(g, (id) => (id === 'q' ? '다른' : '미노피아'));
    expect(text).toMatch(/^스킬 만들기: 최근 4번 시킨/);
    expect(text).toContain('[다른] 휴대폰 400px 화면 확인 좀 해줘');
  });
});
