import { describe, expect, it } from 'vitest';
import { buildDevlog, type ChatEntry } from './devlog';
import type { Snapshot } from './types';
import { EMPTY_WORKFLOW } from './workflow-types';

const snap: Snapshot = {
  projects: [
    { id: 'p1', name: 'MuscleMap', repo: 'o/muscle', description: '', createdAt: '' },
    { id: 'p2', name: 'AI Office', repo: 'o/office', description: '', createdAt: '' },
  ],
  tasks: [
    {
      id: 't1', projectId: 'p1', title: '타이머 오류 수정', description: '', type: 'dev', requestedType: 'auto', priority: 'normal',
      assignee: 'codex', routeReason: '', status: 'review', dispatch: { state: 'none' }, userOriginalText: '타이머가 멈춰요',
      createdAt: '2026-10-30T01:00:00Z', updatedAt: '',
    },
  ],
  usage: [],
  workflow: {
    ...EMPTY_WORKFLOW,
    specs: [{ id: 's1', taskId: 't1', revision: 1, intent: 'change_request', planner: 'chatgpt_manual', userOriginalText: '', finalPrompt: '타이머 setInterval 정리', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '', createdAt: '2026-10-30T01:10:00Z' }],
    approvals: [{ id: 'a1', taskId: 't1', gate: 'A', decision: 'approved', approvedRevision: 1, previousRevision: null, workItemId: '', scope: {}, actor: '', createdAt: '2026-10-30T01:20:00Z' }],
  },
};

const chat: ChatEntry[] = [
  { id: 'c1', role: 'me', text: 'useEffect가 뭐야?', projectId: null, taskId: null, createdAt: '2026-10-30T00:30:00Z' },
  { id: 'c2', role: 'office', text: "'MuscleMap'에 접수했어요", projectId: 'p1', taskId: 't1', createdAt: '2026-10-30T01:00:05Z' },
  { id: 'c3', role: 'me', text: '어제 질문', projectId: null, taskId: null, createdAt: '2026-10-29T03:00:00Z' },
  // KST로는 10/31 00:30
  { id: 'c4', role: 'me', text: '자정 넘김', projectId: 'p2', taskId: null, createdAt: '2026-10-30T15:30:00Z' },
];

describe('buildDevlog', () => {
  const md = buildDevlog(snap, chat, { from: '2026-10-30', to: '2026-10-30' });

  it('프로젝트별 → 날짜별로 묶고 시간순으로 쓴다', () => {
    expect(md).toContain('# 개발일지 2026-10-30');
    const muscle = md.indexOf('## MuscleMap (프로젝트 ID: p1)');
    const none = md.indexOf('## 일반 대화(프로젝트 없음)');
    expect(muscle).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(muscle);
    expect(md.indexOf('업무 접수: 타이머 오류 수정')).toBeLessThan(md.indexOf('기획서 v1'));
    expect(md).toContain('- 10:10 [타이머 오류 수정] 기획서 v1');
    expect(md).toContain('\n  최종 프롬프트: 타이머 setInterval 정리');
    expect(md).toContain(': 승인 (v1)');
  });

  it('날짜는 KST 기준으로 자른다', () => {
    expect(md).not.toContain('어제 질문');
    expect(md).not.toContain('자정 넘김');
    expect(buildDevlog(snap, chat, { from: '2026-10-31', to: '2026-10-31' })).toContain('자정 넘김');
  });

  it('프로젝트 하나만 고를 수 있다', () => {
    const only = buildDevlog(snap, chat, { from: '2026-10-29', to: '2026-10-31' }, 'p1');
    expect(only).toContain('## MuscleMap');
    expect(only).not.toContain('useEffect');
    expect(only).not.toContain('## AI Office');
  });

  it('기록이 없으면 없다고 쓴다', () => {
    expect(buildDevlog(snap, [], { from: '2026-01-01', to: '2026-01-01' })).toContain('(기록 없음)');
  });
});
