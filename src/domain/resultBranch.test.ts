import { describe, expect, it } from 'vitest';
import { resultWithoutBranch } from './workflow';

describe('브랜치 없는 Gemini 결과(v0.5.74)', () => {
  it('Gemini 결과인데 작업 브랜치 줄이 없으면 올릴 수 없는 결과', () => {
    expect(resultWithoutBranch({ source: 'gemini_actions_auto', summary: '바뀐 파일: CLAUDE.md' })).toBe(true);
    expect(resultWithoutBranch({ source: 'gemini_actions_auto', summary: '요약\n작업 브랜치: ai/gemini/abc-w1 (Gemini가 올림)' })).toBe(false);
    expect(resultWithoutBranch({ source: 'claude_session_auto', summary: '요약' })).toBe(false);
    expect(resultWithoutBranch(null)).toBe(false);
  });
});
