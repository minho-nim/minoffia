import { describe, expect, it } from 'vitest';
import { nextTheme } from './theme';

describe('화면 밝기 버튼', () => {
  it('자동 → 밝게 → 어둡게 → 자동으로 돈다', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});
