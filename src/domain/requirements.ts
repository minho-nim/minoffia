// 요구사항 번호와 '다 덮었나' 검사(v0.5.39, GSD Core의 REQ-ID 커버리지에서 착안, MIT). 규칙만, 토큰 0.
// 기획서 테스트 기준의 줄마다 R1, R2…를 붙이고, PM 계획의 작업이 covers로 맡은 번호를 모아 빠진 번호를 찾는다.
import type { WorkItem } from './workflow-types';

/** 테스트 기준을 줄로 나눈다(앞의 -, *, 1. 같은 표시는 뗀다) */
export function requirementLines(testCriteria: string): string[] {
  return testCriteria
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|R\d+[.)]?)\s*/i, '').trim())
    .filter(Boolean);
}

/** PM 지시서에 넣는 번호 붙인 목록 */
export function numberedRequirements(testCriteria: string): string {
  return requirementLines(testCriteria)
    .map((l, i) => `R${i + 1}. ${l}`)
    .join('\n');
}

/**
 * 어느 작업도 맡지 않은 요구사항. 계획의 어떤 작업에도 covers가 없으면(예전 계획) 판단하지 않고 빈 목록.
 */
export function uncoveredRequirements(testCriteria: string, items: Pick<WorkItem, 'covers'>[]): { id: string; text: string }[] {
  if (!items.some((w) => w.covers?.length)) return [];
  const covered = new Set(items.flatMap((w) => (w.covers ?? []).map((c) => c.toUpperCase())));
  return requirementLines(testCriteria)
    .map((text, i) => ({ id: `R${i + 1}`, text }))
    .filter((r) => !covered.has(r.id));
}
