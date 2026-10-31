import { describe, expect, it } from 'vitest';
import { claudeBranch as devBranch } from '../dispatch-claude-dev/payload';
import { buildPrPayload, claudeBranch, MAX_PR_DIFF } from './prPayload';

const input = { taskId: '28333f7e-53cd-44d4-b481-4659e53d5708', repo: 'minho-nim/MinLab-AI-Office', workItemId: 'W1', resultRevision: 2, summary: 'README 한 줄 추가\n자세히', diff: 'diff --git a/README.md b/README.md\n+자동 시험' };

describe('올리기 승인 뒤 PR 열기 지시문(v0.4.5)', () => {
  const t = buildPrPayload(input);

  it('승인된 diff만 적용하고 병합하지 않는다', () => {
    expect(t).toContain('올리기(B 승인됨)');
    expect(t).toContain('작업 브랜치: ai/claude/28333f7e-w1');
    expect(t).toContain('git apply --index /tmp/approved.diff');
    expect(t).toContain('**병합하지 않는다.**');
    expect(t).toContain('+자동 시험');
    expect(t).toContain('"README 한 줄 추가 (AI Office 결과 v2)"');
  });

  it('브랜치 규칙은 보조 개발과 같고, 지시문은 루틴 한도 안', () => {
    expect(claudeBranch(input.taskId, 'W1')).toBe(devBranch(input.taskId, 'W1'));
    expect(buildPrPayload({ ...input, diff: 'x'.repeat(MAX_PR_DIFF) }).length).toBeLessThan(65_000);
  });
});
