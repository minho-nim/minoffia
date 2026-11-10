import { describe, expect, it } from 'vitest';
import { nowInfo } from './nowAction';
import type { WorkflowView } from './workflow';

const v = (over: Partial<WorkflowView>) =>
  ({ stage: 'executing', spec: { revision: 1, intent: 'change_request' }, aApproved: true, planCurrent: true, assignments: [], eApproved: () => true, result: null, bApproved: false, cApproved: false, pendingRevision: null, resultRevised: false, waitingWork: [], prototypeFirst: false, pApproved: false, ...over }) as unknown as WorkflowView;

describe('지금 할 일(v0.6.27)', () => {
  it('취소한 업무는 실패가 남아 있어도 취소로 보이고 버튼이 없다(v0.6.50)', () => {
    const n = nowInfo(v({ stage: 'cancelled', assignments: [{ assignee: 'codex', dispatchStatus: 'failed', actualProviderStatus: '소유자가 업무를 취소함' }] as never }), { done: true });
    expect(n.text).toBe('취소한 업무예요.');
    expect(n.primary).toBeUndefined();
  });
  it('기획 승인 대기면 기획 승인 버튼 하나', () => {
    const n = nowInfo(v({ stage: 'development_approval_pending', aApproved: false }), { done: false });
    expect(n.tone).toBe('turn');
    expect(n.primary?.action).toEqual({ kind: 'approveA' });
  });
  it('개발 중이면 버튼 없이 누가 하는지', () => {
    const n = nowInfo(v({ assignments: [{ assignee: 'codex', dispatchStatus: 'started' }] as never }), { done: false });
    expect(n.tone).toBe('working');
    expect(n.primary).toBeUndefined();
    expect(n.text).toContain('Codex');
  });
  it('시작 실패면 실패와 이유', () => {
    const n = nowInfo(v({ assignments: [{ assignee: 'codex', dispatchStatus: 'failed', actualProviderStatus: 'linear: 시작 못 함 — Codex 환경 없음' }] as never }), { done: false });
    expect(n.tone).toBe('failed');
    expect(n.text).toContain('Codex 환경 없음');
  });
  it('결과가 오면 평균 점수와 결과 승인', () => {
    const n = nowInfo(v({ stage: 'github_approval_pending', result: { revision: 2, diff: 'x' } as never }), { done: false, review: { total: 80, crossTotal: 90 } as never });
    expect(n.text).toContain('평가 85점');
    expect(n.tone).toBe('turn');
  });
  it('CI 통과 전에는 배포 버튼을 내지 않는다', () => {
    expect(nowInfo(v({ stage: 'deployment_approval_pending' }), { done: false, ciPassed: false, prUrl: 'https://github.com/o/r/pull/1' }).primary).toBeUndefined();
  });
  it('결과 승인 뒤 PR이 없으면 PR 다시 열기(v0.6.31)', () => {
    expect(nowInfo(v({ stage: 'deployment_approval_pending' }), { done: false }).secondary?.action).toEqual({ kind: 'openPr' });
  });
  it('배포 승인했는데 배포 실패면 끝남이 아니라 실패와 다시 시도(v0.6.39)', () => {
    const n = nowInfo(v({ stage: 'completed', cApproved: true }), { done: false, deploy: { ok: false, error: 'PR을 병합하지 못했습니다(HTTP 403)' } });
    expect(n.tone).toBe('failed');
    expect(n.primary?.action).toEqual({ kind: 'deploy' });
  });
  it('끝난 업무', () => {
    expect(nowInfo(v({ stage: 'completed' }), { done: true }).tone).toBe('done');
  });
});
