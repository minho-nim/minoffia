import { describe, expect, it } from 'vitest';
import { nextTheme } from './theme';

describe('화면 밝기 버튼', () => {
  it('밝게 ↔ 어둡게 두 가지만 오간다', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});
