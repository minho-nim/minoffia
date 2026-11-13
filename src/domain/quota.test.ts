import { describe, expect, it } from 'vitest';
import { sampleSnapshot } from '../data/sample';
import { quotaFor } from './quota';
import type { AiCall, Snapshot, UsageRun } from './types';

const now = new Date('2026-10-30T03:00:00Z');
const at = '2026-10-30T02:00:00Z';
const call = (ok: boolean, purpose: AiCall['purpose'], httpStatus: number | null = ok ? 200 : 500): AiCall => ({ id: Math.random().toString(), ok, keySlot: 1, purpose, httpStatus, createdAt: at });
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
    expect(quotaFor('studioA', s, now)).toMatchObject({ state: 'available', label: '질문 1·이미지 1' });
    const limited: Snapshot = { ...base, aiCalls: [call(true, 'question'), call(false, 'question', 429)] };
    expect(quotaFor('studioB', limited, now).state).toBe('exhausted');
  });

  it('셀 수 없는 AI는 알 수 없음', () => {
    for (const a of ['mina', 'codex'] as const) expect(quotaFor(a, base, now).state).toBe('unknown');
  });
});
