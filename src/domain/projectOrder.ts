// 프로젝트 순서(v0.6.42, 소유자 "설정으로 순서 바꿀 수 있게, 프로젝트 탭 순서와 연동"): 업무·대화 칩과 프로젝트 탭이 같은 순서를 쓴다.
import type { Project } from './types';

/** 순서 칸(position)이 작은 것부터, 같으면 만든 순서 */
export function orderProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

/** 한 칸 위(-1)·아래(+1)로 옮긴 새 순서(아이디 목록) */
export function moveProject(ordered: Project[], id: string, dir: -1 | 1): string[] {
  const ids = ordered.map((p) => p.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
