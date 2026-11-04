import { describe, expect, it } from 'vitest';
import { loadNewView, loadUiMode, saveNewView, saveUiMode } from './uiMode';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('화면 모드 저장', () => {
  it('값이 없거나 이상하면 Classic, 고르면 다음에도 그대로', () => {
    const s = mem();
    expect(loadUiMode(s)).toBe('classic');
    s.setItem('minlab-ai-office:ui-mode:v1', 'weird');
    expect(loadUiMode(s)).toBe('classic');
    saveUiMode('new', s);
    expect(loadUiMode(s)).toBe('new');
    saveUiMode('classic', s);
    expect(loadUiMode(s)).toBe('classic');
  });
  it('저장소가 막혀도 오류 없이 Classic', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadUiMode(broken)).toBe('classic');
    expect(() => saveUiMode('new', broken)).not.toThrow();
    expect(loadUiMode(null)).toBe('classic');
  });
  it('New Office 보기(공간형·조직형)', () => {
    const s = mem();
    expect(loadNewView(s)).toBe('space');
    saveNewView('org', s);
    expect(loadNewView(s)).toBe('org');
  });
});
