import { describe, expect, it } from 'vitest';
import { preparePlanImport } from './planImport';
import { planText, snapshot, task } from './fixtures.test-helper';

describe('계획 응답의 기획서 버전 유지', () => {
  it('v1 생성 중 다른 기기에서 v2를 승인하면 v1 계획을 v2로 저장하지 않는다', () => {
    const prepared = preparePlanImport(task, planText, 'gemini_fallback', snapshot(2), 1);
    expect(prepared.errors?.join()).toContain('현재 v2에는 저장하지 않았습니다');
    expect('plan' in prepared).toBe(false);
  });
  it('같은 버전의 응답만 해당 승인에 연결한다', () => {
    const prepared = preparePlanImport(task, planText, 'gemini_fallback', snapshot(1), 1);
    expect(prepared.errors).toBeUndefined();
    if ('plan' in prepared) {
      expect(prepared.plan.approvedSpecRevision).toBe(1);
      expect(prepared.assignments[0].dispatchStatus).toBe('awaiting_user_execution_approval');
    }
  });
  it('서버 버전이 누락/손상된 응답도 새 버전으로 바꿔 붙이지 않는다', () => {
    expect(preparePlanImport(task, planText, 'gemini_fallback', snapshot(1), NaN).errors).toBeDefined();
  });
  it('캐시 응답을 다시 받아도 같은 생성 결과를 새 계획으로 만들지 않는다', () => {
    const snap = snapshot();
    const first = preparePlanImport(task, planText, 'gemini_fallback', snap, 1);
    if (!('plan' in first)) throw new Error('첫 계획 생성 실패');
    snap.workflow.plans.push(first.plan);
    const replay = preparePlanImport(task, planText, 'gemini_fallback', snap, 1);
    expect('existing' in replay && replay.existing).toBe(true);
  });
  it('@클로드로 맡긴 업무는 PM 계획의 작업도 Claude가 맡는다(v0.5.46)', () => {
    const prepared = preparePlanImport({ ...task, userOriginalText: '@클로드 다크모드 고쳐줘' }, planText, 'routine_session_auto', snapshot(1), 1);
    if (!('plan' in prepared)) throw new Error('계획 생성 실패');
    expect(prepared.assignments.map((a) => a.assignee)).toEqual(['claude']);
    expect(prepared.plan.plan.mode_reason).toContain('@Claude 지정');
  });
});
