import { describe, expect, it } from 'vitest';
import { canCompare, COMPARE_WHY, compareTarget, reassignPlanText } from './reassign';

const view = (over: Record<string, unknown> = {}) =>
  ({ plan: { plan: { work_items: [{ id: 'w1' }] } }, bApproved: false, waitingWork: [], result: { workItemId: 'w1' }, ...over }) as never;
const done = { workItemId: 'w1', dispatchStatus: 'completed', assignee: 'codex' };

describe('두 AI 비교 버튼(v0.6.54)', () => {
  it('작업 하나가 끝나 결과가 있고 올리기 승인 전일 때만', () => {
    expect(canCompare(view(), done)).toBe(true);
    expect(canCompare(view({ bApproved: true }), done)).toBe(false);
    expect(canCompare(view({ plan: { plan: { work_items: [{ id: 'w1' }, { id: 'w2' }] } } }), done)).toBe(false);
    expect(canCompare(view({ waitingWork: [{}] }), done)).toBe(false);
    expect(canCompare(view(), { ...done, dispatchStatus: 'started' })).toBe(false);
    expect(canCompare(view(), { ...done, assignee: 'gemini' })).toBe(false);
  });
  it('Codex ↔ Claude로 바꾸고, 비교 계획은 이전 결과를 보지 말라고 적는다', () => {
    expect(compareTarget('codex')).toBe('claude_support');
    expect(compareTarget('claude')).toBe('codex_primary');
    const plan = { planRevision: 1, plan: { mode_reason: '', work_items: [{ id: 'w1', goal: '한 줄 추가' }] } } as never;
    const text = JSON.parse(reassignPlanText(plan, 'w1', 'claude_support', `${COMPARE_WHY}: Codex 결과와 비교`));
    expect(text.plan_revision).toBe(2);
    expect(text.work_items[0].goal).toContain('[비교]');
    expect(text.work_items[0].goal).not.toContain('[이어받기]');
    expect(text.mode_reason).toContain('비교');
  });
});
