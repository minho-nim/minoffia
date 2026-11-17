import { describe, expect, it } from 'vitest';
import { uncovered } from './TeamPanel';

describe('대신 맡을 AI가 없는 일 안내', () => {
  it('아무도 휴가가 아니면 안내가 없다', () => {
    expect(uncovered([])).toEqual([]);
  });
  it('Codex만 휴가면 개발은 Claude가 맡으니 안내가 없다', () => {
    expect(uncovered(['codex'])).toEqual([]);
  });
  it('Codex·Claude가 모두 휴가면 개발·기획 안내가 나온다', () => {
    const n = uncovered(['codex', 'claude']);
    expect(n.some((x) => x.startsWith('개발'))).toBe(true);
    expect(n.some((x) => x.startsWith('기획'))).toBe(true);
  });
  it('Studio A·B가 모두 휴가면 Gemini 안내가 나온다', () => {
    expect(uncovered(['studioA', 'studioB']).some((x) => x.includes('Gemini'))).toBe(true);
    expect(uncovered(['search']).some((x) => x.includes('Firecrawl이 대신'))).toBe(true);
    expect(uncovered(['firecrawl']).some((x) => x.includes('요약만'))).toBe(true);
    expect(uncovered(['search', 'firecrawl']).some((x) => x.includes('모두 휴가'))).toBe(true);
  });

});
