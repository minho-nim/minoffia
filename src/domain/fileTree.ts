// 구조도(v0.5.24, 소유자 "기본으로 내 구조도가 보이고, 개발할 땐 수정된 거 보이게, Codex·Claude에도 똑같이"):
// 저장소 파일 목록(서버 repo-tree) + 열린 업무들의 최신 결과 diff에서 바뀐 파일을 합쳐 폴더 나무로 만든다. 토큰 0.
import type { Task } from './types';
import type { ResultPackage } from './workflow-types';

export interface FileChange {
  add: number;
  del: number;
  /** 이 파일을 바꾼 업무 제목 */
  tasks: string[];
}

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  change?: FileChange;
  /** 이 폴더 안에서 바뀐 파일 수 */
  changed: number;
}

/** 통합 diff에서 파일마다 더한·지운 줄 수 */
export function diffStats(diff: string): { path: string; add: number; del: number }[] {
  const out: { path: string; add: number; del: number }[] = [];
  let cur: { path: string; add: number; del: number } | null = null;
  for (const line of diff.split('\n')) {
    const head = /^diff --git a\/\S+ b\/(\S+)$/.exec(line);
    if (head) {
      cur = { path: head[1], add: 0, del: 0 };
      out.push(cur);
    } else if (cur && line.startsWith('+') && !line.startsWith('+++')) cur.add++;
    else if (cur && line.startsWith('-') && !line.startsWith('---')) cur.del++;
  }
  return out;
}

/** 프로젝트의 끝나지 않은 업무마다 최신 결과에서 바뀐 파일(개발 중인 것만) */
export function projectChanges(projectId: string, tasks: Task[], results: ResultPackage[]): Map<string, FileChange> {
  const map = new Map<string, FileChange>();
  for (const t of tasks) {
    if (t.projectId !== projectId || t.status === 'done') continue;
    const latest = results.filter((r) => r.taskId === t.id).sort((a, b) => b.revision - a.revision)[0];
    if (!latest) continue;
    for (const f of diffStats(latest.diff)) {
      const c = map.get(f.path) ?? { add: 0, del: 0, tasks: [] };
      c.add += f.add;
      c.del += f.del;
      if (!c.tasks.includes(t.title)) c.tasks.push(t.title);
      map.set(f.path, c);
    }
  }
  return map;
}

/** 경로 목록 → 폴더 나무(폴더 먼저, 이름순). 바뀐 파일이 목록에 없으면(새 파일) 더해 넣는다. */
export function buildTree(paths: string[], changes: Map<string, FileChange> = new Map()): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [], changed: 0 };
  for (const p of new Set([...paths, ...changes.keys()])) {
    let node = root;
    const parts = p.split('/');
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path, children: [], changed: 0 };
        node.children.push(child);
      }
      node = child;
    });
    const change = changes.get(p);
    if (change) {
      node.change = change;
      let up: TreeNode | undefined = root;
      for (let i = 0; i < parts.length && up; i++) {
        up.changed++;
        up = up.children.find((c) => c.name === parts[i]);
      }
    }
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => Number(b.children.length > 0) - Number(a.children.length > 0) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}
