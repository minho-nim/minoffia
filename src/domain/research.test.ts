import { describe, expect, it } from 'vitest';
import { cleanSources, needsResearch } from './research';

describe('조사(v0.4.61)', () => {
  it('웹에서 찾아야 하는 질문만 고른다', () => {
    for (const t of ['React 최신 버전 뭐야?', 'Supabase 요금 얼마야', '비슷한 앱 찾아줘', 'Gemini 무료 한도 몇 번이야?']) expect(needsResearch(t), t).toBe(true);
    for (const t of ['useEffect가 뭐야?', 'MuscleMap에 다크 모드 추가해줘', '안녕']) expect(needsResearch(t), t).toBe(false);
  });
  it('출처는 http 주소만, 중복 없이, 5개까지', () => {
    const raw = [{ uri: 'https://a.com', title: 'A' }, { uri: 'https://a.com' }, { uri: 'javascript:x' }, ...Array.from({ length: 6 }, (_, i) => ({ uri: `https://b${i}.com` }))];
    const s = cleanSources(raw);
    expect(s).toHaveLength(5);
    expect(s[0]).toEqual({ uri: 'https://a.com', title: 'A' });
    expect(s[1].title).toBe('b0.com');
    expect(cleanSources('x')).toEqual([]);
  });
});
