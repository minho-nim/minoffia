import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { keyBlock, keyWhy } from './keyBlock';

describe('두 Studio 키가 막힌 이유(v0.7.87)', () => {
  it('키마다 이유를 적고, 하나라도 되면 막지 않는다', () => {
    expect(keyWhy('', false, false)).toBe('none');
    expect(keyWhy('k', true, true)).toBe('leave');
    expect(keyWhy('k', true, false)).toBe('full');
    expect(keyWhy('k', false, false)).toBe('ok');
    expect(keyBlock(['ok', 'full'], '40회', '')).toBeNull();
  });
  it('상한 + 휴가는 429로 둘 다 적는다', () => {
    expect(keyBlock(['full', 'leave'], '40회', 'ChatGPT로 복사해 물어보세요.')).toEqual({ status: 429, leave: false, error: 'Studio A: 오늘 상한 다 씀 · Studio B: 휴가(키마다 40회). ChatGPT로 복사해 물어보세요.' });
  });
  it('모두 휴가·키 없음이면 휴가 안내', () => {
    expect(keyBlock(['leave', 'none'], '40회', '')).toEqual({ status: 503, leave: true, error: 'Studio A: 휴가 · Studio B: 키 없음. 팀 관리에서 한 명을 근무로 돌려 주세요.' });
  });
  it('함수마다 같은 복사본', () => {
    const base = readFileSync('supabase/functions/ask-gemini/keyBlock.ts', 'utf8');
    for (const f of ['analyze-image', 'draft-spec', 'design-standard', 'draw-design']) expect(readFileSync(`supabase/functions/${f}/keyBlock.ts`, 'utf8')).toBe(base);
  });
});
