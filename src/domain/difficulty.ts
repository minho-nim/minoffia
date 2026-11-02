// 난이도 기반 배정(v0.4.71, 소유자 2026-11-02 "ㄱ", Task Master의 난이도 점수 아이디어).
// PM이 작업마다 난이도(1~10)를 매기면, 쉬운 일은 싼 AI, 어려운 일만 Claude에게 — 토큰·Claude 실행 횟수를 아낀다.
// 난이도가 없는 예전 계획은 그대로 동작한다(표시만 없음). 배정은 PM이 정하고, 앱은 맞는지 안내만 한다(막지 않음).
import type { AssigneePreference } from './workflow-types';

export type Level = 'easy' | 'normal' | 'hard';
export const LEVEL_LABEL: Record<Level, string> = { easy: '쉬움', normal: '보통', hard: '어려움' };

export function levelOf(difficulty: number | undefined): Level | null {
  if (typeof difficulty !== 'number' || !Number.isFinite(difficulty)) return null;
  return difficulty <= 3 ? 'easy' : difficulty <= 6 ? 'normal' : 'hard';
}

/** 난이도 값 다듬기: 1~10 정수만, 아니면 없음 */
export function cleanDifficulty(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : undefined;
}

/** 개발 작업 기본 배정: 쉬움·보통 = Codex(구독), 어려움 = Claude. 휴가인 AI는 건너뛴다 */
export function suggestedPreference(difficulty: number | undefined, away: { codex?: boolean; claude?: boolean } = {}): AssigneePreference | null {
  const level = levelOf(difficulty);
  if (!level) return null;
  const order: AssigneePreference[] = level === 'hard' ? ['claude_support', 'codex_primary'] : ['codex_primary', 'claude_support'];
  return order.find((p) => !(p === 'codex_primary' ? away.codex : away.claude)) ?? null;
}

/** PM 배정이 난이도에 비해 비싼지(쉬운 일을 Claude에게) — 안내용 */
export function costlyFor(difficulty: number | undefined, pref: AssigneePreference, away: { codex?: boolean; claude?: boolean } = {}): boolean {
  return levelOf(difficulty) === 'easy' && pref === 'claude_support' && !away.codex;
}
