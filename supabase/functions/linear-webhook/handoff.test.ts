import { describe, expect, it } from 'vitest';
import { toClaude } from './handoff';

describe('Codex가 시작 못 하면 Claude로(v0.6.30)', () => {
  it('그 작업만 Claude로 바꾸고 이유를 남긴다', () => {
    const b = toClaude({ mode_reason: '작은 일', work_items: [{ id: 'W1', goal: '버튼', assignee_preference: 'codex_primary' }, { id: 'W2', assignee_preference: 'codex_primary' }] }, 'W1', '환경 없음', 3);
    expect(b.plan_revision).toBe(3);
    expect(b.work_items?.map((w) => w.assignee_preference)).toEqual(['claude_support', 'codex_primary']);
    expect(b.work_items?.[0].goal).toContain('[이어받기]');
    expect(b.mode_reason).toContain('담당 바꿈: W1 → Claude(환경 없음)');
  });
});
