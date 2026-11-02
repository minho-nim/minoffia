// 미뤄 둔 일(v0.4.97, Ponytail debt 아이디어): 개발 AI가 알고 일부러 줄인 곳에 남긴 `shortcut: <한계>, <언제 고칠지>` 주석을
// 결과 diff에서 모은다(규칙만, 토큰 0). 업무마다 최신 결과만 본다(같은 업무의 예전 결과는 새 결과가 대신함).
import type { Task } from './types';
import type { ResultPackage } from './workflow-types';

export interface Shortcut {
  taskId: string;
  taskTitle: string;
  file: string;
  text: string;
  /** 고칠 때(쉼표 뒤)가 없으면 묻히기 쉬워 표시한다 */
  noTrigger: boolean;
}

const MARK = /^\+(?!\+\+).*?(?:\/\/|#|\/\*|--|<!--)\s*(?:shortcut|ponytail):\s*(.+?)\s*(?:\*\/|-->)?\s*$/i;

export function shortcutsInDiff(diff: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.replace(/^\+\+\+ (b\/)?/, '').trim();
      continue;
    }
    const m = MARK.exec(line);
    if (m && file && file !== '/dev/null') out.push({ file, text: m[1].slice(0, 200) });
  }
  return out;
}

export function projectShortcuts(projectId: string, tasks: Task[], results: ResultPackage[]): Shortcut[] {
  const out: Shortcut[] = [];
  for (const t of tasks.filter((x) => x.projectId === projectId)) {
    const latest = results.filter((r) => r.taskId === t.id).sort((a, b) => b.revision - a.revision)[0];
    if (!latest) continue;
    for (const s of shortcutsInDiff(latest.diff)) out.push({ taskId: t.id, taskTitle: t.title, file: s.file, text: s.text, noTrigger: !s.text.includes(',') });
  }
  return out;
}
