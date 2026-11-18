import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from '../data/sample';
import { geminiToday, quotaFor } from './quota';
import type { AiCall, Snapshot, UsageRun } from './types';

const now = new Date('2026-10-30T03:00:00Z');
const at = '2026-10-30T02:00:00Z';
const call = (ok: boolean, purpose: AiCall['purpose'], httpStatus: number | null = ok ? 200 : 500, keySlot: 1 | 2 = 1, tokens: number | null = null): AiCall => ({ id: Math.random().toString(), ok, keySlot, purpose, httpStatus, tokens, createdAt: at });
const run = (i: number): UsageRun => ({ id: `r${i}`, agent: 'claude', taskId: null, kind: 'cloud', day: '2026-10-30', createdAt: at });

describe('quotaFor', () => {
  const base = sampleSnapshot();

  it('Claude: 기록한 횟수와 상한', () => {
    const s: Snapshot = { ...base, usage: [run(1), run(2)] };
    expect(quotaFor('claude', s, now)).toMatchObject({ state: 'available', label: '2/20회' });
    const full: Snapshot = { ...base, usage: Array.from({ length: 20 }, (_, i) => run(i)) };
    expect(quotaFor('claude', full, now).state).toBe('exhausted');
  });

  it('Gemini: 성공 횟수를 용도별로 세고, 오늘 마지막이 429면 소진', () => {
    const s: Snapshot = { ...base, aiCalls: [call(true, 'question'), call(true, 'image'), call(false, 'question')] };
    expect(quotaFor('studioA', s, now)).toMatchObject({ state: 'available', label: '2회' });
    expect(quotaFor('studioA', s, now).detail).toContain('질문 1·웹 조사 0·이미지 1');
    const limited: Snapshot = { ...base, aiCalls: [call(true, 'question', 200, 2), call(false, 'question', 429, 2)] };
    expect(quotaFor('studioB', limited, now).state).toBe('exhausted');
    expect(quotaFor('studioA', limited, now).state).toBe('available');
  });

  it('에이전트 탭 Studio A·B 토큰을 더하면 오늘 사용량 Gemini 합계와 같다(웹 조사 포함)', () => {
    // 운영 2026-11-18 재현: 질문 1회(1,018) + 웹 조사 4회(35,882) — 예전에는 에이전트 탭이 '질문 1·이미지 0'만 보였다
    const calls = [call(true, 'question', 200, 1, 1018), call(true, 'research', 200, 1, 9000), call(true, 'research', 200, 1, 9000), call(true, 'research', 200, 2, 9000), call(true, 'research', 200, 2, 8882), call(false, 'research')];
    const s: Snapshot = { ...base, aiCalls: calls };
    const all = geminiToday(calls, now);
    expect(all).toMatchObject({ calls: 5, tokens: 36900, text: '5회 · 36.9k 토큰' });
    expect(quotaFor('studioA', s, now).label).toBe('3회 · 19.0k 토큰');
    expect(quotaFor('studioB', s, now).label).toBe('2회 · 17.9k 토큰');
    expect(geminiToday(calls, now, 1).tokens + geminiToday(calls, now, 2).tokens).toBe(all.tokens);
  });

  it('셀 수 없는 AI는 알 수 없음', () => {
    for (const a of ['mina', 'codex'] as const) expect(quotaFor(a, base, now).state).toBe('unknown');
  });
});
