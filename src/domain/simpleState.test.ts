import { describe, expect, it } from 'vitest';
import { simpleStates, stateCounts } from './simpleState';
import { snapshot, task } from '../workflow/fixtures.test-helper';

describe('업무 상태 다섯 가지(v0.6.15)', () => {
  it('끝난 업무는 끝남, 실패한 전송은 실패', () => {
    const snap = snapshot();
    expect(simpleStates([{ ...task, status: 'done' }], snap.workflow).get(task.id)).toBe('done');
    expect(simpleStates([{ ...task, dispatch: { state: 'failed', error: 'x' } }], snap.workflow).get(task.id)).toBe('failed');
  });
  it('기획 승인할 차례면 내 차례', () => {
    const snap = snapshot();
    snap.workflow = { ...snap.workflow, approvals: [], results: [] };
    expect(simpleStates([task], snap.workflow).get(task.id)).toBe('turn');
  });
  it('숫자는 멈춤과 실패를 합쳐 센다', () => {
    const m = new Map([['a', 'working'], ['b', 'turn'], ['c', 'stalled'], ['d', 'failed'], ['e', 'done']] as const);
    expect(stateCounts(new Map(m), ['a', 'b', 'c', 'd', 'e'])).toEqual({ working: 1, turn: 1, stuck: 2 });
  });
});
