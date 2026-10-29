import { describe, expect, it } from 'vitest';
import { canTransition, nextStatuses } from './status';

const t = (status: Parameters<typeof nextStatuses>[0]['status'], state: 'none' | 'dispatching' | 'failed' = 'none') => ({
  status,
  dispatch: { state },
});

describe('status', () => {
  it('완료는 검토 대기에서만 승인할 수 있다', () => {
    expect(canTransition(t('in_progress'), 'done')).toBe(false);
    expect(canTransition(t('queued'), 'done')).toBe(false);
    expect(canTransition(t('review'), 'done')).toBe(true);
  });

  it('Claude 전송 중에는 상태를 바꾸지 못한다', () => {
    expect(nextStatuses(t('queued', 'dispatching'))).toEqual([]);
  });

  it('완료된 업무는 다시 검토로 열 수 있다', () => {
    expect(nextStatuses(t('done'))).toEqual(['review']);
  });

  it('원격 실행 실패로 차단된 업무는 바로 완료로 갈 수 없다', () => {
    expect(canTransition(t('blocked', 'failed'), 'done')).toBe(false);
  });
});
