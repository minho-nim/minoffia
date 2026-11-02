import { describe, expect, it } from 'vitest';
import { buildClaudeReviewPayload, resultBranch } from './claude';

describe('Claude 채점 지시(v0.4.94)', () => {
  it('결과를 낸 AI의 브랜치만 알려 준다', () => {
    expect(resultBranch('gemini_actions_auto', 'ABCDEF12-0000-4000-8000-000000000000', 'w1')).toBe('ai/gemini/abcdef12-w1');
    expect(resultBranch('claude_session_auto', 'abcdef12-0000', 'w2')).toBe('ai/claude/abcdef12-w2');
    expect(resultBranch('codex_cloud_manual', 'abcdef12-0000', 'w1')).toBe('');
  });
  it('채점만, 쓰기 금지, 제출표로 보낸다', () => {
    const t = buildClaudeReviewPayload({ taskId: 't1', resultRevision: 2, repo: 'o/r', branch: '', material: '## 자료', submit: { url: 'https://x/functions/v1/submit-review', token: 'tok' } });
    expect(t.split('\n')[0]).toBe('MinLab AI Office 채점');
    expect(t).toContain('push·PR을 하지 않는다');
    expect(t).toContain('"result_revision":2');
    expect(t).toContain('submit-review');
    expect(t).toContain('"parts"');
  });
});
