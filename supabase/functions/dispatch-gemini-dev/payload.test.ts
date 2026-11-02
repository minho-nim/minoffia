import { describe, expect, it } from 'vitest';
import { CLAUDE_MD_SYNC as APP_SYNC, codexBranch } from '../../../src/domain/handoffV2';
import type { Task } from '../../../src/domain/types';
import { buildGeminiTask, CLAUDE_MD_SYNC, geminiBranch, MAX_INSTRUCTIONS } from './payload';

describe('Gemini 개발 할 일(v0.4.82)', () => {
  it('브랜치 이름은 앱과 같은 규칙', () => {
    const id = '7c338331-1de2-45c6-840e-a02f9780e466';
    expect(geminiBranch(id, 'W1')).toBe('ai/gemini/7c338331-w1');
    expect(geminiBranch(id, 'W1')).toBe(codexBranch({ id } as Task, 'W1', 'gemini'));
  });
  it('CLAUDE.md 맞추기 문장은 앱과 같다', () => {
    expect(CLAUDE_MD_SYNC).toBe(APP_SYNC);
  });
  it('기획서·유지 조건·완료 기준·지켜야 할 것을 담고 길면 자른다', () => {
    const t = buildGeminiTask({ title: 'README 한 줄', goal: '안내 추가', finalPrompt: 'README 끝에 한 줄', changeScope: 'README.md', preserve: ['다른 파일 그대로'], acceptance: ['README에 줄이 있다'], projectRules: ['한국어로'] });
    for (const x of ['### README 한 줄', 'README 끝에 한 줄', '변경 범위: README.md', '- 다른 파일 그대로', '- README에 줄이 있다', '- 한국어로', CLAUDE_MD_SYNC]) expect(t).toContain(x);
    expect(buildGeminiTask({ title: 'x', goal: '', finalPrompt: '가'.repeat(30_000), changeScope: '', preserve: [], acceptance: [], projectRules: [] }).length).toBeLessThanOrEqual(MAX_INSTRUCTIONS);
    expect(buildGeminiTask({ title: 'x', goal: '', finalPrompt: 'y', changeScope: '', preserve: [], acceptance: [], projectRules: [] })).not.toContain('CLAUDE.md');
  });
});
