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

describe('결과는 있는데 작업이 시작됨에 남은 경우', () => {
  it('그 작업의 자동 결과가 이미 있으면 작업을 완료로 고쳐 올리기 승인이 막히지 않게 한다', async () => {
    const snap = snapshot();
    const a = {
      id: 'as1', taskId: 't1', planRevision: 1, workItemId: 'W1', title: '', assignee: 'gemini' as const, executionMode: 'gemini_actions' as const,
      dispatchStatus: 'started' as const, statusSource: 'server_verified' as const, providerExecutionId: null, providerTaskUrl: null,
      actualProviderStatus: 'workflow_dispatched', startedAt: null, lastVerifiedAt: null, updatedAt: '',
    };
    snap.workflow = {
      ...snap.workflow,
      assignments: [a, { ...a, id: 'as2', workItemId: 'W2' }],
      results: [{ ...snap.workflow.results[0], planRevision: 1, workItemId: 'W1', source: 'gemini_actions_auto' }],
    };
    const updateAssignment = vi.fn().mockResolvedValue(undefined);
    await receiveWorkflowInbox({
      snap, reported: new Set(), say: vi.fn(), step: vi.fn(), importPlanText: vi.fn(),
      store: { loadPlanInbox: vi.fn().mockResolvedValue([]), loadResultInbox: vi.fn().mockResolvedValue([]), updateAssignment } as unknown as OfficeStore,
    });
    expect(updateAssignment).toHaveBeenCalledTimes(1);
    expect(updateAssignment).toHaveBeenCalledWith(expect.objectContaining({ id: 'as1', dispatchStatus: 'completed' }));
  });

  it('바뀐 것이 없는 실패 결과는 결과로 만들지 않고 작업을 중단으로 표시한다(v0.5.88)', async () => {
    const snap = snapshot();
    const a = {
      id: 'as1', taskId: 't1', planRevision: 1, workItemId: 'W1', title: '', assignee: 'gemini' as const, executionMode: 'gemini_actions' as const,
      dispatchStatus: 'started' as const, statusSource: 'none' as const, providerExecutionId: null, providerTaskUrl: null,
      actualProviderStatus: 'workflow_dispatched', startedAt: null, lastVerifiedAt: null, updatedAt: '',
    };
    const plan = { id: 'p1', taskId: 't1', planRevision: 1, approvedSpecRevision: 1, targetBaseRevision: '', source: 'manual' as const, createdAt: '', plan: { task_id: 't1', repository: 'o/r', target_base_revision: '', plan_revision: 1, status: 'planned' as const, questions: [], work_items: [] } };
    snap.workflow = { ...snap.workflow, plans: [plan], assignments: [a], results: [] };
    const updateAssignment = vi.fn().mockResolvedValue(undefined);
    const markResultInbox = vi.fn().mockResolvedValue(true);
    const step = vi.fn();
    await receiveWorkflowInbox({
      snap, reported: new Set(), say: vi.fn(), step, importPlanText: vi.fn(),
      store: {
        loadPlanInbox: vi.fn().mockResolvedValue([]),
        loadResultInbox: vi.fn().mockResolvedValue([{ id: 'i1', taskId: 't1', assignmentId: 'as1', summary: '', changedFiles: '', diff: '', testLog: '', remainingIssues: '끝까지 못 감', branch: '', previewUrl: '', screenshots: [] }]),
        updateAssignment, markResultInbox,
      } as unknown as OfficeStore,
    });
    expect(step).not.toHaveBeenCalled();
    expect(updateAssignment).toHaveBeenCalledWith(expect.objectContaining({ id: 'as1', dispatchStatus: 'failed' }));
    expect(markResultInbox).toHaveBeenCalledWith('i1', 'invalid', expect.any(String));
  });
});
