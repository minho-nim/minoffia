// 반복되는 문제(v0.5.41, sprag 래칫 규칙에서 착안, Apache-2.0): 채점에서 같은 위반·고칠 점이 서로 다른 결과 2번 이상에
// 나오면 프로젝트 탭에 보이고, 소유자가 누르면 '이 프로젝트에서 지켜야 할 것'에 들어가 다음 지시서부터 함께 간다. 규칙만, 토큰 0.
// shortcut: 글자·패턴으로 판정되는 것을 1단계 기계 검사로 자동 옮기는 것은 아직 안 함, 같은 항목이 쌓이면 rubric ruleCheck에 손으로 더한다.
import type { Task } from './types';
import type { ResultReview } from './workflow-types';

const norm = (s: string) => s.toLowerCase().replace(/[\s.,·:;!?"'`()[\]{}~-]+/g, '');

export function repeatIssues(reviews: ResultReview[], tasks: Pick<Task, 'id' | 'projectId'>[], projectId: string, existingRules: string[] = [], min = 2): { text: string; count: number }[] {
  const inProject = new Set(tasks.filter((t) => t.projectId === projectId).map((t) => t.id));
  const known = new Set(existingRules.map(norm));
  const seen = new Map<string, { text: string; results: Set<string> }>();
  for (const r of reviews) {
    if (!inProject.has(r.taskId) || !r.score) continue;
    for (const text of [...(r.score.violations ?? []), ...(r.score.fixes ?? [])]) {
      const key = norm(text);
      if (key.length < 4 || known.has(key)) continue;
      const cur = seen.get(key) ?? { text: text.trim(), results: new Set<string>() };
      cur.results.add(`${r.taskId}:${r.resultRevision}`);
      seen.set(key, cur);
    }
  }
  return [...seen.values()]
    .filter((x) => x.results.size >= min)
    .map((x) => ({ text: x.text.slice(0, 200), count: x.results.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}
