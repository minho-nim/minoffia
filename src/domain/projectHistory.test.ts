import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from '../data/sample';
import { projectHistory, type ChatEntry } from './devlog';

describe('프로젝트 한 일 기록(v0.4.74)', () => {
  it('그 프로젝트의 업무 기록과 대화만, 날짜별 최근 것부터', () => {
    const snap = sampleSnapshot();
    const p = snap.projects[0];
    const task = snap.tasks.find((t) => t.projectId === p.id)!;
    const other = snap.projects[1];
    const chat: ChatEntry[] = [
      { id: 'c1', role: 'me', text: '어제 한 말', projectId: p.id, taskId: null, createdAt: '2026-11-01T03:00:00Z' },
      { id: 'c2', role: 'office', text: `접수했어요\n둘째 줄`, projectId: null, taskId: task.id, createdAt: '2026-11-02T03:00:00Z' },
      { id: 'c3', role: 'me', text: '다른 프로젝트', projectId: other.id, taskId: null, createdAt: '2026-11-02T04:00:00Z' },
    ];
    const days = projectHistory(snap, chat, p.id);
    const all = days.flatMap((d) => d.items);
    expect(all.some((i) => i.head.includes('다른 프로젝트'))).toBe(false);
    const c2 = all.find((i) => i.head === '미니엉: 접수했어요')!;
    expect(c2.more).toBe('둘째 줄');
    expect(c2.taskTitle).toBe(task.title);
    const order = days.map((d) => d.day);
    expect([...order].sort().reverse()).toEqual(order);
    expect(days.find((d) => d.day === '2026-11-01')?.items.some((i) => i.head === '나: 어제 한 말')).toBe(true);
  });

  it('긴 첫 줄은 줄여 보이고 전체는 펼치면 보인다', () => {
    const snap = sampleSnapshot();
    const p = snap.projects[0];
    const long = '가'.repeat(200);
    const [day] = projectHistory(snap, [{ id: 'x', role: 'me', text: long, projectId: p.id, taskId: null, createdAt: '2099-01-01T00:00:00Z' }], p.id);
    expect(day.items[0].head.length).toBeLessThan(150);
    expect(day.items[0].more).toBe(`나: ${long}`);
  });
});
