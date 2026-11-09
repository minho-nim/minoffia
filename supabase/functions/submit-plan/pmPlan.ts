import { cleanDifficulty } from './difficulty.ts';
import type { AgentKind, AssigneePreference, DevelopmentMode, ExecutionMode, PlanBody, WorkItem } from './planTypes.ts';

const PREFS: AssigneePreference[] = ['codex_primary', 'claude_support', 'gemini_optional', 'grok_optional', 'gemini_dev'];
const MODES: ExecutionMode[] = ['codex_cloud', 'manual_handoff'];

export const PREF_AGENT: Record<AssigneePreference, AgentKind> = {
  codex_primary: 'codex',
  claude_support: 'claude',
  gemini_optional: 'gemini',
  grok_optional: 'grok',
  gemini_dev: 'gemini',
};

export type ParseResult = { ok: true; plan: PlanBody } | { ok: false; errors: string[] };

/** 세션에서 복사한 텍스트에서 ```json 블록(없으면 첫 { ~ 마지막 })을 꺼낸다. */
export function extractJson(text: string): string | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1].trim());
  const candidate = fenced.reverse().find((c) => c.startsWith('{'));
  if (candidate) return candidate;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Claude PM이 돌려준 계획을 검증한다. 틀린 필드를 모두 모아 알려준다. */
export function parsePmPlan(text: string, expectedTaskId: string): ParseResult {
  const raw = extractJson(text);
  if (!raw) return { ok: false, errors: ['JSON을 찾지 못했습니다. 세션 마지막 메시지의 ```json 블록을 붙여넣으세요.'] };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, errors: [`JSON 형식 오류: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  const o = data as Record<string, unknown>;
  if (typeof o !== 'object' || o === null) return { ok: false, errors: ['최상위가 객체가 아닙니다.'] };
  if (o.task_id !== expectedTaskId) errors.push(`task_id가 이 업무(${expectedTaskId.slice(0, 8)}…)와 다릅니다.`);
  if (typeof o.repository !== 'string' || !o.repository.includes('/')) errors.push('repository가 owner/repo 형식이 아닙니다.');
  if (o.status !== 'planned' && o.status !== 'needs_clarification') errors.push('status는 planned 또는 needs_clarification이어야 합니다.');
  const questions = o.questions === undefined ? [] : o.questions;
  if (!isStrArray(questions)) errors.push('questions는 문자열 배열이어야 합니다.');
  if (!Array.isArray(o.work_items)) errors.push('work_items 배열이 없습니다.');

  const items: WorkItem[] = [];
  const ids = new Set<string>();
  (Array.isArray(o.work_items) ? o.work_items : []).forEach((w, i) => {
    const item = w as Record<string, unknown>;
    const at = `work_items[${i}]`;
    if (typeof item.id !== 'string' || !item.id) errors.push(`${at}.id가 없습니다.`);
    else if (ids.has(item.id)) errors.push(`${at}.id(${item.id})가 중복됩니다.`);
    else ids.add(item.id);
    if (typeof item.title !== 'string' || !item.title) errors.push(`${at}.title이 없습니다.`);
    if (!PREFS.includes(item.assignee_preference as AssigneePreference)) errors.push(`${at}.assignee_preference가 올바르지 않습니다.`);
    if (!MODES.includes(item.execution_mode as ExecutionMode)) errors.push(`${at}.execution_mode가 올바르지 않습니다.`);
    for (const key of ['dependencies', 'acceptance_tests', 'preserve_constraints', 'attachment_refs'] as const) {
      if (item[key] !== undefined && !isStrArray(item[key])) errors.push(`${at}.${key}는 문자열 배열이어야 합니다.`);
    }
    items.push({
      id: String(item.id ?? ''),
      title: String(item.title ?? ''),
      goal: String(item.goal ?? ''),
      dependencies: isStrArray(item.dependencies) ? item.dependencies : [],
      assignee_preference: item.assignee_preference as AssigneePreference,
      execution_mode: item.execution_mode as ExecutionMode,
      acceptance_tests: isStrArray(item.acceptance_tests) ? item.acceptance_tests : [],
      preserve_constraints: isStrArray(item.preserve_constraints) ? item.preserve_constraints : [],
      attachment_refs: isStrArray(item.attachment_refs) ? item.attachment_refs : [],
      // 실행 승인은 항상 필요하다. 계획이 false로 와도 무시한다.
      requires_execution_approval: true,
      // 난이도(v0.4.71): 1~10 정수만, 틀리거나 없으면 빼고 계획은 그대로 받는다(예전 계획 호환)
      ...(cleanDifficulty(item.difficulty) !== undefined ? { difficulty: cleanDifficulty(item.difficulty) } : {}),
      ...(typeof item.difficulty_reason === 'string' && item.difficulty_reason.trim() ? { difficulty_reason: item.difficulty_reason.trim().slice(0, 200) } : {}),
      // 맡는 요구사항 번호(v0.5.39): R+숫자만 받고 나머지는 버린다(없어도 계획은 받음)
      ...(isStrArray(item.covers) ? { covers: item.covers.map((c) => c.trim().toUpperCase()).filter((c) => /^R\d{1,3}$/.test(c)).slice(0, 50) } : {}),
    });
  });
  for (const item of items) {
    for (const dep of item.dependencies) if (!ids.has(dep)) errors.push(`${item.id}의 의존 작업 ${dep}가 계획에 없습니다.`);
  }
  if (o.status === 'planned' && items.length === 0) errors.push('planned인데 work_items가 비어 있습니다.');
  // 개발 방식(07단계). 없으면 바로 개발(이전 계획 호환).
  const mode = o.development_mode === undefined ? 'direct' : o.development_mode;
  if (mode !== 'prototype_first' && mode !== 'direct') errors.push('development_mode는 prototype_first 또는 direct여야 합니다.');
  if (o.mode_reason !== undefined && typeof o.mode_reason !== 'string') errors.push('mode_reason은 문자열이어야 합니다.');
  if (mode === 'prototype_first' && o.status === 'planned' && !items.some((i) => i.assignee_preference === 'gemini_optional'))
    errors.push('prototype_first면 AI Studio 견본 작업(assignee_preference: gemini_optional)이 하나 있어야 합니다.');
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    plan: {
      ...(typeof o.generation_id === 'string' && /^[0-9a-f-]{36}$/i.test(o.generation_id) ? { generation_id: o.generation_id } : {}),
      development_mode: mode as DevelopmentMode,
      mode_reason: typeof o.mode_reason === 'string' ? o.mode_reason.slice(0, 300) : '',
      task_id: String(o.task_id),
      repository: String(o.repository),
      target_base_revision: typeof o.target_base_revision === 'string' ? o.target_base_revision : '',
      plan_revision: typeof o.plan_revision === 'number' ? o.plan_revision : 1,
      status: o.status as PlanBody['status'],
      questions: questions as string[],
      work_items: items,
    },
  };
}
