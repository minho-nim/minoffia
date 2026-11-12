// 규칙 칸·개발 스킬이 들어 있는 프로젝트(v0.6.82 소유자 "고정 내용은 저장소에, 지시서는 할 일만").
// App이 스킬 상태(skill_cache 또는 GitHub)를 읽을 때 채우고, 지시서를 만드는 곳(App·업무 카드)이 묻는다.
// 스킬 넣기(Actions)는 늘 규칙 칸도 같이 넣으므로 repo-map 스킬이 있으면 규칙 칸도 있다.
// shortcut: 규칙 칸을 저장소에서 직접 지우면 알 수 없다, 서버가 AGENTS.md 표시를 직접 확인하게 되면 그 값을 쓴다.
import { SLIM_MARKER_SKILL } from '../domain/devHabits';
import type { SkillMapData } from '../domain/skills';

const slim = new Set<string>();
export function setSlimProjects(map: SkillMapData) {
  slim.clear();
  for (const [id, m] of Object.entries(map)) if (m?.[SLIM_MARKER_SKILL]) slim.add(id);
}
export const isSlimProject = (id?: string | null): boolean => !!id && slim.has(id);
