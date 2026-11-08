import { describe, expect, it } from 'vitest';
import { addDesignWord, DESIGN_WORDS } from './designWords';

describe('디자인 단어 버튼(v0.5.54)', () => {
  it('단어 설명을 더하고 같은 단어는 한 번만', () => {
    const once = addDesignWord('', '더 차분하게');
    expect(once.startsWith('더 차분하게:')).toBe(true);
    expect(addDesignWord(once, '더 차분하게')).toBe(once);
    expect(addDesignWord('버튼 크게', '다듬기').split('\n')).toHaveLength(2);
    expect(addDesignWord('x', '없는 단어')).toBe('x');
    expect(DESIGN_WORDS).toHaveLength(7);
  });
});
