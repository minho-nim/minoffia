import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from '../data/sample';
import type { ChatEntry } from './devlog';
import { projectStory } from './projectHistory';

describe('프로젝트 한 일 기록(v0.4.75 업무별)', () => {
  const snap = sampleSnapshot();
  const p = snap.projects[0];
  const task = snap.tasks.find((t) => t.projectId === p.id)!;
  const other = snap.projects[1];
  const chat: ChatEntry[] = [
    { id: 'c1', role: 'me', text: '업무 밖 한 말', projectId: p.id, taskId: null, createdAt: '2099-01-01T03:00:00Z' },
    { id: 'c2', role: 'office', text: '접수했어요', projectId: null, taskId: task.id, createdAt: '2099-01-02T03:00:00Z' },
    { id: 'c3', role: 'me', text: '다른 프로젝트', projectId: other.id, taskId: null, createdAt: '2099-01-02T04:00:00Z' },
  ];

  it('업무별로 묶고 접수 단계가 들어간다, 대화는 켜야 보인다', () => {
    const s = projectStory(snap, chat, p.id);
    expect(s.tasks.length).toBeGreaterThan(0);
    expect(s.tasks.every((t) => t.items.every((i) => i.step !== 'chat'))).toBe(true);
    const mine = s.tasks.find((t) => t.taskId === task.id)!;
    expect(mine.items[0].step).toBe('intake');
    expect(s.counts.total).toBe(snap.tasks.filter((t) => t.projectId === p.id).length);
  });

  it('대화를 켜면 업무 대화는 그 업무에, 나머지는 업무 밖 대화로, 다른 프로젝트는 빠진다', () => {
    const s = projectStory(snap, chat, p.id, true);
    const loose = s.tasks.find((t) => t.taskId === null)!;
    expect(loose.title).toBe('업무 밖 대화');
    expect(loose.items.map((i) => i.line)).toEqual(['나: 업무 밖 한 말']);
    expect(s.tasks[0].taskId).toBe(task.id);
    const mine = s.tasks.find((t) => t.taskId === task.id)!;
    expect(mine.items.at(-1)!.line).toBe('미니엉: 접수했어요');
    expect(s.tasks.flatMap((t) => t.items).some((i) => i.line.includes('다른 프로젝트'))).toBe(false);
  });
});
