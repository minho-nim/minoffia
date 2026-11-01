import { describe, expect, it } from 'vitest';
import { uncovered } from './TeamPanel';

describe('대신 맡을 AI가 없는 일 안내', () => {
  it('아무도 휴가가 아니면 안내가 없다', () => {
    expect(uncovered([])).toEqual([]);
  });
  it('Codex만 휴가면 개발은 Claude가 맡으니 개발 안내는 없고, 중요 기획(ChatGPT) 안내만 있다', () => {
    const n = uncovered(['codex']);
    expect(n.some((x) => x.startsWith('개발'))).toBe(false);
    expect(n.some((x) => x.includes('ChatGPT'))).toBe(true);
  });
  it('Codex·Claude가 모두 휴가면 개발·기획 안내가 나온다', () => {
    const n = uncovered(['codex', 'claude']);
    expect(n.some((x) => x.startsWith('개발'))).toBe(true);
    expect(n.some((x) => x.startsWith('기획'))).toBe(true);
  });
  it('Studio A·B가 모두 휴가면 Gemini 안내가 나온다', () => {
    expect(uncovered(['studioA', 'studioB']).some((x) => x.includes('Gemini'))).toBe(true);
  });
  it('Codex와 Studio A·B가 모두 휴가면 Gemini로 진행한다고 하지 않는다', () => {
    const n = uncovered(['codex', 'studioA', 'studioB']);
    expect(n.some((x) => x.includes('Gemini 기획서 초안으로 진행'))).toBe(false);
    expect(n.some((x) => x.startsWith('기획서:'))).toBe(true);
  });
});
