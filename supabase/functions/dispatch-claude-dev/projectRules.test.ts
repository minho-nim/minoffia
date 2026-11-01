import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanRules, MAX_NEW_RULES, previewUrl, rulesSection } from './projectRules';

const COPIES = ['draft-spec', 'dispatch-claude', 'submit-plan', 'submit-result'];

describe('프로젝트에서 지켜야 할 것(v0.4.57)', () => {
  it('AI가 보낸 후보를 한 줄·2~200자·중복 없이 최대 5개로 다듬는다', () => {
    expect(cleanRules('x')).toEqual([]);
    expect(cleanRules(['- 모바일  가로 넘침\n없게', '모바일 가로 넘침 없게', 'a', 3, 'x'.repeat(201)])).toEqual(['모바일 가로 넘침 없게']);
    expect(cleanRules(Array.from({ length: 9 }, (_, i) => `규칙 ${i}번`))).toHaveLength(MAX_NEW_RULES);
  });

  it('규칙이 없으면 절을 넣지 않는다', () => {
    expect(rulesSection([])).toEqual([]);
    expect(rulesSection(['결제 없음'])[1]).toBe('- 결제 없음');
  });

  it('Cloudflare 브랜치 미리보기 주소', () => {
    expect(previewUrl('minlab-ai-office.pages.dev', 'ai/claude/28333f7e-w1')).toBe('https://ai-claude-28333f7e-w1.minlab-ai-office.pages.dev');
    expect(previewUrl('x.pages.dev', 'ai/claude/28333f7e-very-long-work-item')).toBe('https://ai-claude-28333f7e-very-long.x.pages.dev');
    expect(previewUrl('', 'ai/claude/a')).toBe('');
    expect(previewUrl('https://x.pages.dev', 'ai/claude/a')).toBe('');
  });

  it('함수마다 복사한 파일이 모두 같다', () => {
    const base = readFileSync(new URL('./projectRules.ts', import.meta.url), 'utf8');
    for (const fn of COPIES) expect(readFileSync(new URL(`../${fn}/projectRules.ts`, import.meta.url), 'utf8'), fn).toBe(base);
  });
});
