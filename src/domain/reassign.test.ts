import { describe, expect, it } from 'vitest';
import { quotaHit, reassignPlanText, reassignTargets } from './reassign';
import type { PmPlan } from './workflow-types';

const plan = { id: 'p', taskId: 't', planRevision: 2, approvedSpecRevision: 1, targetBaseRevision: '', source: 'manual', createdAt: '',
  plan: { task_id: 't', repository: 'me/app', target_base_revision: '', plan_revision: 2, status: 'planned', development_mode: 'direct', mode_reason: '작은 일', questions: [],
    work_items: [{ id: 'W1', title: 'a', goal: '버튼 키우기', dependencies: [], assignee_preference: 'codex_primary', execution_mode: 'manual_handoff', acceptance_tests: [], preserve_constraints: [], attachment_refs: [], requires_execution_approval: true }] } } as unknown as PmPlan;

describe('담당 바꾸기·한도 넘기기(v0.5.73)', () => {
  it('한도 흔적을 알아챈다', () => {
    expect(quotaHit({ dispatchStatus: 'failed', actualProviderStatus: 'linear: 시작 못 함 — usage limit reached' })).toBe(true);
    expect(quotaHit({ dispatchStatus: 'blocked_quota', actualProviderStatus: 'unknown' })).toBe(true);
    expect(quotaHit({ dispatchStatus: 'failed', actualProviderStatus: '저장소 없음' })).toBe(false);
  });
  it('바꿀 수 있는 담당에서 지금 담당과 AI Office의 Gemini를 뺀다', () => {
    expect(reassignTargets('codex', false)).toEqual(['claude_support', 'gemini_dev']);
    expect(reassignTargets('claude', true)).toEqual(['codex_primary']);
  });
  it('그 작업만 담당을 바꾸고 다음 계획 버전·이어받기 메모를 단다', () => {
    const p = JSON.parse(reassignPlanText(plan, 'W1', 'gemini_dev', 'Codex 한도'));
    expect(p.plan_revision).toBe(3);
    expect(p.work_items[0].assignee_preference).toBe('gemini_dev');
    expect(p.work_items[0].goal).toContain('[이어받기]');
    expect(p.mode_reason).toContain('담당 바꿈: W1 → Gemini 개발(Codex 한도)');
  });
});
