import { describe, expect, it, vi } from 'vitest';
import { forgetMaps, freshReport, mapHtml } from './mapCache';
import { parseHealth } from '../domain/healthText';

const report = (checkedAt: string) => ({ checkedAt, head: '', files: 1, summary: { high: 0, medium: 0, low: 0 }, issues: [] });

describe('지도 저장(v0.6.78)', () => {
  it('점검 결과는 10분 안에는 다시 받지 않고, 다시 점검하면 새로', async () => {
    const load = vi.fn(async () => report('a'));
    await freshReport('p1', { load });
    await freshReport('p1', { load });
    expect(load).toHaveBeenCalledTimes(1);
    forgetMaps('p1');
    await freshReport('p1', { load });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('자세한 지도는 점검 시각이 같으면 다시 받지 않는다(저장 공간이 없어도 앱 안에서는 기억)', async () => {
    const map = vi.fn(async () => '<html>');
    expect(await mapHtml('p2', 't1', { map })).toBe('<html>');
    await mapHtml('p2', 't1', { map });
    expect(map).toHaveBeenCalledTimes(1);
    await mapHtml('p2', 't2', { map });
    expect(map).toHaveBeenCalledTimes(2);
  });
  it('점검 결과에 함께 저장한 파일 목록(구조도)을 읽는다', () => {
    const r = parseHealth({ ...report('a'), tree: ['src/a.ts', 3, 'b.md'] });
    expect(r?.tree).toEqual(['src/a.ts', 'b.md']);
    expect(parseHealth(report('a'))?.tree).toBeUndefined();
  });
});
