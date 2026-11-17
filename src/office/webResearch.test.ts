import { describe, expect, it } from 'vitest';
import { currentResearch, setResearchPhase } from './webResearch';

describe('웹 조사 단계(v0.7.60)', () => {
  it('찾기 → 쓰기 → 끝, 2분 지나면 저절로 끝', () => {
    setResearchPhase('search');
    expect(currentResearch()?.step).toBe('search');
    setResearchPhase('write', 'studioB');
    expect(currentResearch()).toMatchObject({ step: 'write', studio: 'studioB' });
    expect(currentResearch(Date.now() + 3 * 60_000)).toBeNull();
    setResearchPhase(null);
    expect(currentResearch()).toBeNull();
  });
});
