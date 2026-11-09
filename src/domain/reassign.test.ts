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

describe('CI 실패 다시 맡기기(v0.5.75)', () => {
  it('실패한 검사 이름을 적고 같은 커밋으로는 한 번만', async () => {
    const { ciFixDone, ciFixWhy } = await import('./reassign');
    const why = ciFixWhy({ headSha: 'abcdef1234', checks: [{ name: 'verify', conclusion: 'failure' }, { name: 'lint', conclusion: 'success' }] });
    expect(why).toBe('CI 고치기 abcdef1: 실패한 검사 verify');
    expect(ciFixDone(`작은 일 · 담당 바꿈: W1 → Claude(${why})`, 'abcdef1234')).toBe(true);
    expect(ciFixDone('작은 일', 'abcdef1234')).toBe(false);
  });
});

describe('한도 자동 넘기기(v0.5.81)', () => {
  it('다음 AI를 순서대로 고르고 휴가·지금 담당·AI Office Gemini는 뺀다', async () => {
    const { nextAgent } = await import('./reassign');
    expect(nextAgent('codex', {}, false)).toBe('gemini_dev');
    expect(nextAgent('codex', {}, true)).toBe('claude_support');
    expect(nextAgent('gemini', { claude: true }, false)).toBe('codex_primary');
    expect(nextAgent('claude', { gemini: true, codex: true }, false)).toBeNull();
  });
});

describe('지시 받음 확인(v0.5.84)', () => {
  it('시작 요청이 5분 넘게 안 끝나거나, 시작 뒤 너무 오래 소식이 없으면 경고', async () => {
    const { staleStart } = await import('./reassign');
    const now = Date.parse('2026-11-09T10:00:00Z');
    expect(staleStart({ assignee: 'gemini', dispatchStatus: 'starting', startedAt: null, updatedAt: '2026-11-09T09:54:00Z' }, now)).toContain('6분');
    expect(staleStart({ assignee: 'gemini', dispatchStatus: 'started', startedAt: '2026-11-09T09:30:00Z', updatedAt: '' }, now)).toBeNull();
    expect(staleStart({ assignee: 'gemini', dispatchStatus: 'started', startedAt: '2026-11-09T09:20:00Z', updatedAt: '' }, now)).toContain('40분째');
    expect(staleStart({ assignee: 'codex', dispatchStatus: 'started', startedAt: '2026-11-09T09:00:00Z', updatedAt: '' }, now)).toBeNull();
    expect(staleStart({ assignee: 'claude', dispatchStatus: 'completed', startedAt: '2026-11-09T01:00:00Z', updatedAt: '' }, now)).toBeNull();
  });
});
