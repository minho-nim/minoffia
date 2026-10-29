import { AGENT_BY_ID } from './agents';
import type { AgentId, UsageRun } from './types';

/** KST(UTC+9) 기준 날짜. 서버의 `(now() at time zone 'Asia/Seoul')::date`와 같다. */
export function kstDay(date: Date = new Date()): string {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function runsToday(usage: UsageRun[], agent: AgentId, now: Date = new Date()): number {
  const day = kstDay(now);
  return usage.filter((r) => r.agent === agent && r.day === day).length;
}

/** 남은 실행 수. 상한이 없으면 Infinity. */
export function remainingToday(usage: UsageRun[], agent: AgentId, now: Date = new Date()): number {
  const cap = AGENT_BY_ID[agent].dailyCap;
  if (cap === null) return Infinity;
  return Math.max(0, cap - runsToday(usage, agent, now));
}
