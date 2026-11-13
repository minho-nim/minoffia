import { describe, expect, it } from 'vitest';
import { importDecision, resultSummary, type ImportFacts } from './importResult';

const base: ImportFacts = {
  assignment: { assignee: 'gemini', execution_mode: 'gemini_actions', dispatch_status: 'started', plan_revision: 2 },
  latestPlanRevision: 2, latestResult: null, latestResultBApproved: false, diff: 'diff --git a b',
};

describe('서버에서 결과 바로 받기(v0.5.90)', () => {
  it('지금 계획의 시작된 자동 개발 결과면 옮긴다', () => {
    expect(importDecision(base)).toBe('import');
    expect(importDecision({ ...base, assignment: { ...base.assignment!, assignee: 'claude', execution_mode: 'manual_handoff' } })).toBe('import');
  });
  it('바뀐 것이 없으면 작업을 중단으로', () => {
    expect(importDecision({ ...base, diff: '  ' })).toBe('failed');
  });
  it('애매하면 앱에 맡긴다', () => {
    expect(importDecision({ ...base, assignment: null })).toBe('skip');
    expect(importDecision({ ...base, latestPlanRevision: 3 })).toBe('skip');
    expect(importDecision({ ...base, assignment: { ...base.assignment!, dispatch_status: 'completed' } })).toBe('skip');
    expect(importDecision({ ...base, assignment: { ...base.assignment!, assignee: 'gemini', execution_mode: 'manual_handoff' } })).toBe('skip');
    expect(importDecision({ ...base, latestResult: { revision: 1, plan_revision: 2 }, latestResultBApproved: true })).toBe('skip');
  });
  it('Codex(Linear)가 제출표로 보낸 결과도 받는다(v0.6.19)', () => {
    expect(importDecision({ ...base, assignment: { ...base.assignment!, assignee: 'codex', execution_mode: 'manual_handoff' } })).toBe('import');
  });
  it('이전 계획의 결과에 B가 있어도 새 계획 결과는 받는다(다시 하기)', () => {
    expect(importDecision({ ...base, latestResult: { revision: 1, plan_revision: 1 }, latestResultBApproved: true })).toBe('import');
  });
  it('요약은 앱과 같은 모양', () => {
    expect(resultSummary({ summary: '고침', changed_files: 'a.ts', branch: 'ai/gemini/x', preview_url: '' }, true)).toBe('고침\n\n바뀐 파일:\na.ts\n\n작업 브랜치: ai/gemini/x (Gemini가 올림, PR은 올리기 승인 뒤)');
  });
});
