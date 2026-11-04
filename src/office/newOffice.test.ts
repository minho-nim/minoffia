import { describe, expect, it } from 'vitest';
import { AGENTS } from '../domain/agents';
import type { Task } from '../domain/types';
import { activeCount, SPACES, spaceOfScene, spaceOfTask, spaceStats, statusText, teamOf } from './newOffice';
import { buildScene } from './scene';

const base: Omit<Task, 'id' | 'title' | 'type' | 'assignee' | 'status'> = {
  projectId: 'p',
  description: '',
  requestedType: 'auto',
  priority: 'normal',
  routeReason: '',
  dispatch: { state: 'none' },
  createdAt: '2026-10-29T00:00:00Z',
  updatedAt: '2026-10-29T00:00:00Z',
};
const task = (p: Partial<Task> & Pick<Task, 'id' | 'type' | 'assignee' | 'status'>): Task => ({ ...base, title: p.id, ...p });

describe('New Office 규칙', () => {
  it('등록된 AI는 모두 한 팀에 속하고, 팀은 역할·기본 방에서 정한다', () => {
    const teams = Object.fromEntries(AGENTS.map((a) => [a.id, teamOf(a)]));
    expect(teams).toMatchObject({ mina: 'hub', claude: 'planning', grok: 'research', codex: 'development', studioA: 'design', studioB: 'design', ci: 'quality' });
    // 새 AI가 생겨도 공간을 새로 만들지 않고 기존 공간에 들어간다
    expect(SPACES.map((s) => s.id)).toContain(teamOf({ id: 'mina', home: null, role: '새 역할' }));
  });

  it('업무는 유형의 공간으로, 올리기·배포 단계면 배포 공간으로 간다', () => {
    expect(spaceOfTask(task({ id: 'a', type: 'dev', assignee: 'codex', status: 'in_progress' }))).toBe('development');
    expect(spaceOfTask(task({ id: 'b', type: 'prototype', assignee: 'studioA', status: 'queued' }))).toBe('design');
    expect(spaceOfTask(task({ id: 'c', type: 'dev', assignee: 'codex', status: 'review', stage: 'deployment_approval_pending' }))).toBe('deploy');
    expect(spaceOfTask(task({ id: 'd', type: 'qa', assignee: 'ci', status: 'done', prUrl: 'https://x/pull/1' }))).toBe('deploy');
  });

  it('숫자와 사람은 실제 업무로만 센다(휴가인 AI는 공간에 없다)', () => {
    const tasks = [
      task({ id: 'r', type: 'dev', assignee: 'codex', status: 'in_progress' }),
      task({ id: 'w', type: 'dev', assignee: 'claude', status: 'queued' }),
      task({ id: 'x', type: 'dev', assignee: 'claude', status: 'blocked' }),
      task({ id: 'z', type: 'dev', assignee: 'codex', status: 'done' }),
    ];
    const scene = buildScene(tasks);
    const st = spaceStats('development', tasks, scene, []);
    expect([st.running.length, st.waiting.length, st.blocked.length, st.done]).toEqual([1, 1, 1, 1]);
    expect(st.present).toContain('codex');
    expect(spaceStats('development', tasks, scene, ['codex']).present).not.toContain('codex');
    // 작업 중인 Codex + 접수 메모를 지키는 미니엉
    expect(activeCount(scene, [])).toBe(2);
    expect(activeCount(scene, ['codex'])).toBe(1);
  });

  it('견본·디자인 일을 하는 AI는 견본·디자인 공간, 쉬는 AI는 자기 팀 공간에 흐리게', () => {
    const scene = buildScene([task({ id: 'p', type: 'design', assignee: 'studioA', status: 'in_progress' })]);
    expect(spaceOfScene(scene.find((s) => s.agent === 'studioA')!)).toBe('design');
    const grok = scene.find((s) => s.agent === 'grok')!;
    expect(grok.activity).toBe('resting');
    expect(spaceOfScene(grok)).toBe('research');
  });

  it('상태 글', () => {
    expect(statusText('working', false)).toBe('작업 중');
    expect(statusText('working', true)).toBe('휴가');
    expect(statusText(undefined, false)).toBe('쉬는 중');
  });
});
