import { describe, expect, it } from 'vitest';
import { parseSiteCheck, verdictLine } from './siteCheck';

const shot = (size: string, errorCount = 0, overflow = false) => ({ size, width: 400, errors: [], errorCount, overflow, file: `after-${size}.jpg` });

describe('화면 확인(v0.6.9)', () => {
  it('바뀐 미리보기에 오류·넘침이 없으면 통과', () => {
    const c = parseSiteCheck({ result: { checkedAt: 'x', targets: [{ key: 'after', url: 'https://a', status: 200, shots: [shot('pc'), shot('mobile')] }] }, images: { 'after-pc.jpg': 'https://s' } })!;
    expect(verdictLine(c)).toEqual({ ok: true, text: '바뀐 미리보기: 콘솔 오류 0개 · 가로 넘침 없음' });
  });
  it('오류·휴대폰 넘침을 알린다', () => {
    const c = parseSiteCheck({ result: { checkedAt: 'x', targets: [{ key: 'live', url: 'https://a', status: 200, shots: [shot('pc', 2), shot('mobile', 0, true)] }] } })!;
    expect(verdictLine(c)).toEqual({ ok: false, text: '배포 뒤 운영: 콘솔 오류 2개 · 가로 넘침 휴대폰' });
  });
  it('못 열었으면 그렇게 알린다', () => {
    const c = parseSiteCheck({ result: { checkedAt: 'x', targets: [{ key: 'after', url: 'https://a', status: 404, shots: [] }] } })!;
    expect(verdictLine(c).text).toContain('HTTP 404');
    expect(parseSiteCheck({ images: {} })).toBeNull();
  });
});
