import { describe, expect, it } from 'vitest';
import { areaNameInBrowser, nameFromBdc, nameFromNominatim } from './areaName';

const bdc = {
  city: '성남시',
  locality: '수내동',
  localityInfo: {
    administrative: [
      { name: '대한민국', adminLevel: 2, order: 1 },
      { name: '경기도', adminLevel: 4, order: 3 },
      { name: '성남시', adminLevel: 6, order: 5 },
      { name: '분당구', adminLevel: 7, order: 6 },
      { name: '수내동', adminLevel: 10, order: 8 },
    ],
  },
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe('동네 이름은 브라우저에서(v0.8.12)', () => {
  it('BigDataCloud → 시 구 동', () => {
    expect(nameFromBdc(bdc)).toBe('성남시 분당구 수내동');
    expect(nameFromBdc({ city: 'Seongnam', locality: 'Sunae' })).toBe('Sunae');
    expect(nameFromBdc({})).toBe('');
  });
  it('Nominatim 규칙', () => {
    expect(nameFromNominatim({ address: { quarter: '수내동', borough: '분당구', city: '성남시' } })).toBe('성남시 분당구 수내동');
  });
  it('첫 곳이 막히면 다음 곳, 둘 다 안 되면 빈 글', async () => {
    const seen: string[] = [];
    const name = await areaNameInBrowser(37.3812345, 127.1198765, async (u) => (seen.push(u), u.includes('bigdatacloud') ? json({}, 403) : json({ address: { quarter: '수내동', borough: '분당구', city: '성남시' } })));
    expect(name).toBe('성남시 분당구 수내동');
    expect(seen[0]).toContain('latitude=37.381&longitude=127.120');
    expect(await areaNameInBrowser(1, 2, async () => json({}, 500))).toBe('');
  });
});
