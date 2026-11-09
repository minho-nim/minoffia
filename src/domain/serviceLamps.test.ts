import { describe, expect, it } from 'vitest';
import { serviceLamps } from './serviceLamps';

describe('서버실 불빛(v0.5.57)', () => {
  it('기록이 없으면 회색, 마지막 기록으로 초록·빨강', () => {
    expect(serviceLamps({ prChecks: [], deployments: [] }, [], false).map((l) => l.state)).toEqual(['unknown', 'unknown', 'unknown']);
    const now = Date.parse('2026-11-09T01:00:00Z');
    const lamps = serviceLamps(
      {
        prChecks: [{ ciState: 'success', checkedAt: '2026-11-08T00:00:00Z' }, { ciState: 'failure', checkedAt: '2026-11-08T05:00:00Z' }] as never,
        deployments: [{ ok: true, error: '', createdAt: '2026-11-08T06:00:00Z' }] as never,
      },
      [{ id: 'a', ok: false, keySlot: null, purpose: 'question', httpStatus: 503, createdAt: '2026-11-09T00:30:00Z' }],
      true,
      now,
    );
    expect(lamps.map((l) => l.state)).toEqual(['bad', 'ok', 'bad']);
  });
});
