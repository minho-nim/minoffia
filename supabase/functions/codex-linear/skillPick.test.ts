import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { skillPickRule as app } from '../../../src/domain/skillPick';
import { skillPickRule } from './skillPick';

describe('개발 스킬 고르기 복사본(v0.7.0)', () => {
  it('서버 함수 세 곳의 skillPickRule이 앱과 같다', () => {
    const body = (s: string) => s.slice(s.indexOf('export function skillPickRule'), s.indexOf('\n}', s.indexOf('export function skillPickRule')));
    const src = body(readFileSync(new URL('../../../src/domain/skillPick.ts', import.meta.url), 'utf8'));
    for (const f of ['codex-linear', 'dispatch-claude-dev']) expect(body(readFileSync(new URL(`../${f}/skillPick.ts`, import.meta.url), 'utf8'))).toBe(src);
    expect(skillPickRule(['ui-check'])).toEqual(app(['ui-check']));
  });
});
