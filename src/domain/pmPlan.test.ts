import { describe, expect, it } from 'vitest';
import { extractJson, parsePmPlan } from './pmPlan';

const TASK = 'dacc111e-3f6b-4e65-a9d5-6bc8d6295fff';
const plan = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    task_id: TASK,
    repository: 'minho-nim/MinLab-AI-Office',
    target_base_revision: 'abc123',
    plan_revision: 1,
    status: 'planned',
    questions: [],
    work_items: [
      { id: 'W1', title: '버튼', goal: 'g', dependencies: [], assignee_preference: 'codex_primary', execution_mode: 'manual_handoff', acceptance_tests: ['npm test'], preserve_constraints: [], attachment_refs: [], requires_execution_approval: false },
      { id: 'W2', title: '리뷰', goal: 'g', dependencies: ['W1'], assignee_preference: 'claude_support', execution_mode: 'manual_handoff' },
    ],
    ...over,
  });

describe('parsePmPlan', () => {
  it('세션 메시지 속 ```json 블록을 꺼내 검증한다', () => {
    const r = parsePmPlan(`계획입니다.\n\`\`\`json\n${plan()}\n\`\`\`\n끝`, TASK);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.work_items).toHaveLength(2);
      expect(r.plan.work_items[1].dependencies).toEqual(['W1']);
    }
  });

  it('계획이 실행 승인 불필요라고 해도 항상 승인을 요구한다', () => {
    const r = parsePmPlan(plan(), TASK);
    expect(r.ok && r.plan.work_items.every((w) => w.requires_execution_approval)).toBe(true);
  });

  it('다른 업무의 계획은 거절한다', () => {
    const r = parsePmPlan(plan({ task_id: 'other' }), TASK);
    expect(r.ok).toBe(false);
  });

  it('잘못된 담당·없는 의존 작업·중복 id를 모두 알려준다', () => {
    const r = parsePmPlan(
      plan({
        work_items: [
          { id: 'W1', title: 'a', assignee_preference: 'codex', execution_mode: 'manual_handoff' },
          { id: 'W1', title: 'b', assignee_preference: 'codex_primary', execution_mode: 'manual_handoff', dependencies: ['W9'] },
        ],
      }),
      TASK,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(' ')).toContain('assignee_preference');
      expect(r.errors.join(' ')).toContain('중복');
      expect(r.errors.join(' ')).toContain('W9');
    }
  });

  it('JSON이 없거나 깨지면 이유를 알려준다', () => {
    expect(parsePmPlan('그냥 글', TASK).ok).toBe(false);
    expect(parsePmPlan('{ "task_id": ', TASK).ok).toBe(false);
  });

  it('질문만 있는 계획(needs_clarification)은 작업 없이도 통과', () => {
    const r = parsePmPlan(plan({ status: 'needs_clarification', questions: ['무엇을 설계할까요?'], work_items: [] }), TASK);
    expect(r.ok).toBe(true);
  });

  it('extractJson은 마지막 json 블록을 쓴다', () => {
    expect(extractJson('```json\n{"a":1}\n```\n```json\n{"b":2}\n```')).toBe('{"b":2}');
  });
});

describe('개발 방식(v0.3.5 Prototype First)', () => {
  it('값이 없으면 바로 개발(direct)', () => {
    const r = parsePmPlan(plan(), TASK);
    expect(r.ok && r.plan.development_mode).toBe('direct');
  });

  it('견본 먼저는 AI Studio 견본 작업(gemini_optional)이 있어야 한다', () => {
    const bad = parsePmPlan(plan({ development_mode: 'prototype_first' }), TASK);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join()).toContain('gemini_optional');
    const good = parsePmPlan(
      plan({
        development_mode: 'prototype_first',
        mode_reason: '새 화면이라 견본부터',
        work_items: [
          { id: 'W1', title: '견본', assignee_preference: 'gemini_optional', execution_mode: 'manual_handoff' },
          { id: 'W2', title: '통합', dependencies: ['W1'], assignee_preference: 'codex_primary', execution_mode: 'manual_handoff' },
        ],
      }),
      TASK,
    );
    expect(good.ok && good.plan.development_mode).toBe('prototype_first');
    expect(good.ok && good.plan.mode_reason).toBe('새 화면이라 견본부터');
  });

  it('모르는 방식은 거절', () => {
    const r = parsePmPlan(plan({ development_mode: 'yolo' }), TASK);
    expect(r.ok).toBe(false);
  });
});

describe('난이도(v0.4.71)', () => {
  it('난이도가 있으면 받고, 틀리거나 없어도 계획은 그대로 받는다', () => {
    const withD = JSON.parse(plan());
    withD.work_items[0].difficulty = 3;
    withD.work_items[0].difficulty_reason = '문구 수정';
    const r = parsePmPlan(JSON.stringify(withD), TASK);
    expect(r.ok && r.plan.work_items[0].difficulty).toBe(3);
    const bad = JSON.parse(plan());
    bad.work_items[0].difficulty = 99;
    const r2 = parsePmPlan(JSON.stringify(bad), TASK);
    expect(r2.ok).toBe(true);
    expect(r2.ok && r2.plan.work_items[0].difficulty).toBeUndefined();
  });
});

describe('Gemini 개발 배정(v0.4.82)', () => {
  it('gemini_dev는 받지 않는다(2026-11-13 Gemini 개발 뺌)', () => {
    const r = parsePmPlan(plan({ work_items: [{ id: 'W1', title: '문구', goal: 'g', dependencies: [], assignee_preference: 'gemini_dev', execution_mode: 'manual_handoff' }] }), TASK);
    expect(r.ok).toBe(false);
  });
});
