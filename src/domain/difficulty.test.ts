import { describe, expect, it } from 'vitest';
import { cleanDifficulty, costlyFor, levelOf, suggestedPreference } from './difficulty';

describe('난이도 기반 배정(v0.4.71)', () => {
  it('1~3 쉬움, 4~6 보통, 7~10 어려움, 없으면 null', () => {
    expect([1, 3, 4, 6, 7, 10].map(levelOf)).toEqual(['easy', 'easy', 'normal', 'normal', 'hard', 'hard']);
    expect(levelOf(undefined)).toBeNull();
  });
  it('1~10 정수만 받는다', () => {
    expect(cleanDifficulty(5)).toBe(5);
    expect(cleanDifficulty('8')).toBe(8);
    expect(cleanDifficulty(0)).toBeUndefined();
    expect(cleanDifficulty(4.5)).toBeUndefined();
    expect(cleanDifficulty('어려움')).toBeUndefined();
  });
  it('쉬운·보통 일은 Codex, 어려운 일은 Claude, 휴가면 다른 쪽', () => {
    // v0.4.82: 쉬움은 Gemini 개발(무료)이 먼저, 보통은 Codex
    expect(suggestedPreference(2)).toBe('gemini_dev');
    expect(suggestedPreference(5)).toBe('codex_primary');
    expect(suggestedPreference(8)).toBe('claude_support');
    expect(suggestedPreference(2, { gemini: true })).toBe('codex_primary');
    expect(suggestedPreference(2, { gemini: true, codex: true })).toBe('claude_support');
    expect(suggestedPreference(5, { codex: true })).toBe('claude_support');
    expect(suggestedPreference(8, { claude: true })).toBe('codex_primary');
    expect(suggestedPreference(undefined)).toBeNull();
  });
  it('쉬운 일을 Claude에게 주면 비싸다고 안내(Codex가 휴가면 아님)', () => {
    expect(costlyFor(2, 'claude_support')).toBe(true);
    expect(costlyFor(2, 'claude_support', { codex: true })).toBe(false);
    expect(costlyFor(8, 'claude_support')).toBe(false);
  });
});
