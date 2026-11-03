import { describe, expect, it, vi } from 'vitest';
import type { OfficeStore } from '../data/store';
import { receiveWorkflowInbox } from './receiveInbox';
import { planText, snapshot } from './fixtures.test-helper';

describe('계획 수신', () => {
  it('이전 기획서로 온 계획은 가져오지 않고 잘못된 응답으로 표시한다', async () => {
    const markPlanInbox = vi.fn();
    const importPlanText = vi.fn();
    await receiveWorkflowInbox({
      snap: snapshot(2), reported: new Set(), say: vi.fn(), step: vi.fn(), importPlanText,
      store: {
        loadPlanInbox: vi.fn().mockResolvedValue([{ id: 'in1', taskId: 't1', specRevision: 1, planText }]),
        markPlanInbox, loadResultInbox: vi.fn().mockResolvedValue([]),
      } as unknown as OfficeStore,
    });
    expect(importPlanText).not.toHaveBeenCalled();
    expect(markPlanInbox).toHaveBeenCalledWith('in1', 'invalid', expect.stringContaining('지금 기획서는 v2'));
  });
  it('저장에 실패하면 수신 완료로 표시하지 않아 다음 확인 때 재시도한다', async () => {
    const markPlanInbox = vi.fn();
    const importPlanText = vi.fn().mockResolvedValue(['통신 오류']);
    const snap = snapshot();
    await receiveWorkflowInbox({
      snap, reported: new Set(), say: vi.fn(), step: vi.fn(), importPlanText,
      store: {
        loadPlanInbox: vi.fn().mockResolvedValue([{ id: 'in1', taskId: 't1', specRevision: 1, planText }]),
        markPlanInbox, loadResultInbox: vi.fn().mockResolvedValue([]), load: vi.fn().mockResolvedValue(snap),
      } as unknown as OfficeStore,
    });
    expect(importPlanText).toHaveBeenCalledWith(snap.tasks[0], planText, 'routine_session_auto', snap, 1);
    expect(markPlanInbox).not.toHaveBeenCalledWith('in1', 'imported', expect.anything());
  });
});
