// 미배정 캐릭터(2026-11-02, 소유자): 아직 연결된 AI가 없는 예비 캐릭터. 사무실에는 나오지 않고 팀 관리 탭에만 보인다.
// 새 AI를 연결할 때 이 그림을 characters/<id>-stand|walk.png로 옮기고 agents.ts에 그 AI를 더한다.
const files = import.meta.glob('../assets/office/unassigned/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface UnassignedCharacter {
  id: string;
  /** 캐릭터 설명(역할 느낌) */
  label: string;
  stand: string;
  walk: string | null;
}

const LABEL: Record<string, string> = {
  planner: '기획 · 긴 생머리',
  nightdev: '야간 개발 · 투블럭',
  lead: '팀장 · 안경',
};

export function unassignedCharacters(source: Record<string, string> = files): UnassignedCharacter[] {
  const ids = [...new Set(Object.keys(source).map((p) => p.match(/\/([^/]+)-(stand|walk)\.png$/)?.[1]).filter((x): x is string => Boolean(x)))];
  return ids
    .map((id) => ({
      id,
      label: LABEL[id] ?? id,
      stand: source[`../assets/office/unassigned/${id}-stand.png`] ?? '',
      walk: source[`../assets/office/unassigned/${id}-walk.png`] ?? null,
    }))
    .filter((c) => c.stand)
    .sort((a, b) => Object.keys(LABEL).indexOf(a.id) - Object.keys(LABEL).indexOf(b.id));
}
