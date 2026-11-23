import { describe, expect, it } from 'vitest';
import { modelLabel } from './ChatBot';

describe('챗봇 답한 모델 이름(v0.8.0)', () => {
  it('Flash·Lite를 짧게', () => {
    expect(modelLabel('gemini-3.5-flash')).toBe('Flash');
    expect(modelLabel('gemini-3.5-flash-lite')).toBe('Lite');
    expect(modelLabel('gemini-3.1-flash-lite')).toBe('Lite 3.1');
    expect(modelLabel(undefined)).toBe('');
  });
});
