// 소유자가 고른 개발 스킬 → 지시서 규칙 한 줄(v0.7.0). src/domain/skillPick.ts의 skillPickRule을 그대로 복사했다(같은지는 시험이 확인).
/** 소유자가 고른 스킬 → 지시서 규칙 한 줄(없으면 빈 목록) */
export function skillPickRule(skills: string[] | null | undefined): string[] {
  const list = [...new Set((skills ?? []).filter((n) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(n)))].slice(0, 12);
  return list.length ? [`소유자가 이 업무에 고른 스킬: ${list.join(', ')} — 시작할 때 이 스킬의 SKILL.md 절차를 먼저 따르고, 결과의 "쓴 스킬:" 줄에 적는다.`] : [];
}
