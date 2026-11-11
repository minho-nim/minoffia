import { describe, expect, it } from 'vitest';
import { taskTimeline, timelineTime } from './timeline';
import type { WorkflowData } from './workflow-types';

const wf = (over: Partial<WorkflowData>): WorkflowData =>
  ({ specs: [], approvals: [], plans: [], assignments: [], results: [], revisionRequests: [], attachments: [], imageAnalyses: [], links: [], prChecks: [], deployments: [], clarifications: [], reviews: [], ...over }) as WorkflowData;

describe('업무 기록 타임라인(v0.6.54)', () => {
  it('시간순으로, 자동 실행 승인과 넘겨주기·실패 이유를 보인다', () => {
    const t = taskTimeline('t1', wf({
      specs: [{ taskId: 't1', revision: 1, planner: 'gemini_draft', createdAt: '2026-11-11T00:00:00Z' }] as never,
      approvals: [
        { taskId: 't1', gate: 'A', decision: 'approved', workItemId: '', scope: {}, createdAt: '2026-11-11T00:01:00Z' },
        { taskId: 't1', gate: 'E', decision: 'approved', workItemId: 'w1', scope: { auto: true }, createdAt: '2026-11-11T00:02:00Z' },
      ] as never,
      plans: [
        { taskId: 't1', planRevision: 1, source: 'rule_small', plan: { work_items: [{ id: 'w1' }] }, createdAt: '2026-11-11T00:01:30Z' },
        { taskId: 't1', planRevision: 2, source: 'manual', plan: { mode_reason: '담당 바꿈: w1 → Claude(Codex 환경 없음)', work_items: [{ id: 'w1' }] }, createdAt: '2026-11-11T00:04:00Z' },
      ] as never,
      assignments: [
        { taskId: 't1', planRevision: 1, workItemId: 'w1', assignee: 'codex', dispatchStatus: 'failed', actualProviderStatus: 'Codex 환경 없음', startedAt: '2026-11-11T00:02:30Z', updatedAt: '2026-11-11T00:03:00Z' },
        { taskId: 'other', planRevision: 1, workItemId: 'w1', assignee: 'claude', dispatchStatus: 'completed', actualProviderStatus: '', startedAt: '2026-11-11T00:00:10Z', updatedAt: '2026-11-11T00:00:20Z' },
      ] as never,
      reviews: [{ taskId: 't1', resultRevision: 1, total: 90, judge: 'Gemini', verdict: 'pass', crossTotal: 80, crossJudge: 'Claude', createdAt: '2026-11-11T00:06:00Z' }] as never,
    }));
    expect(t.map((e) => e.text)).toEqual([
      '기획서 v1 (Gemini 초안)',
      '기획 승인',
      '계획 v1: 작업 1개 (Codex) · 작은 일 규칙',
      '실행 승인(기획 승인에 포함, 자동) · w1',
      'Codex w1 시작',
      'Codex w1 실패: Codex 환경 없음',
      '넘겨주기: w1 → Claude (Codex 환경 없음)',
      '채점 v1: 90점 (Gemini) · 교차 80점(Claude)',
    ]);
    expect(t.find((e) => e.text.startsWith('넘겨주기'))?.tone).toBe('turn');
    expect(t.find((e) => e.text.includes('실패'))?.tone).toBe('bad');
  });
  it('PR 확인은 마지막 것 하나만', () => {
    const t = taskTimeline('t1', wf({
      prChecks: [
        { taskId: 't1', prState: 'open', merged: false, ciState: 'pending', checkedAt: '2026-11-11T00:00:00Z' },
        { taskId: 't1', prState: 'open', merged: false, ciState: 'success', checkedAt: '2026-11-11T00:05:00Z' },
      ] as never,
    }));
    expect(t.map((e) => e.text)).toEqual(['PR 열림 · 검사 통과']);
  });
  it('시각은 한국 시간, 같은 날이면 시:분만', () => {
    expect(timelineTime('2026-11-11T00:05:00Z', new Date('2026-11-11T03:00:00Z'))).toBe('09:05');
    expect(timelineTime('2026-11-10T00:05:00Z', new Date('2026-11-11T03:00:00Z'))).toBe('11/10 09:05');
  });
});

describe('두 AI 비교(v0.6.54)', () => {
  it('비교로 맡긴 계획은 넘겨주기가 아니라 비교로 보인다', () => {
    const t = taskTimeline('t1', wf({
      plans: [{ taskId: 't1', planRevision: 2, source: 'manual', plan: { mode_reason: '담당 바꿈: w1 → Claude(비교: Codex 결과와 비교)', work_items: [{ id: 'w1' }] }, createdAt: '2026-11-11T00:00:00Z' }] as never,
    }));
    expect(t[0].text).toBe('비교: w1을 Claude에게도 따로 맡김');
  });
});
