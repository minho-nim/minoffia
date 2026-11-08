// 바뀐 곳 구조도(Archify) 재료(v0.5.43): 결과 diff에서 파일별 +/− 줄 수를 세고 Archify tree JSON을 만든다.
// scripts/change-tree.mjs와 같은 모양(Gemini 개발 워크플로가 쓰는 것). 외부 의존 없음, 모델 호출 없음.
export type FileStat = { path: string; add: number; del: number };

const MAX_FILES = 40;

/** 통합 diff(git diff)에서 파일별 추가·삭제 줄 수 */
export function statsFromDiff(diff: string): FileStat[] {
  const files: FileStat[] = [];
  let cur: FileStat | null = null;
  for (const line of diff.split('\n')) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      cur = { path: m[2].trim(), add: 0, del: 0 };
      files.push(cur);
      continue;
    }
    if (!cur || line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) cur.add++;
    else if (line.startsWith('-')) cur.del++;
  }
  return files;
}

const sum = (fs: FileStat[], k: 'add' | 'del') => fs.reduce((s, f) => s + f[k], 0);

/** 폴더 → 파일 나무(Archify tree 형식). 파일이 많으면 앞의 40개만 */
export function changeTree(files: FileStat[], repo: string) {
  const shown = files.slice(0, MAX_FILES);
  const nodes: { id: string; label: string; parent?: string; sublabel?: string }[] = [
    { id: 'root', label: repo || '저장소', sublabel: `바뀐 파일 ${files.length}개 · +${sum(files, 'add')} −${sum(files, 'del')}` },
  ];
  const dirIds = new Map<string, string>();
  let n = 0;
  const idFor = () => `n${++n}`;
  const dirNode = (dir: string): string => {
    if (!dir) return 'root';
    const known = dirIds.get(dir);
    if (known) return known;
    const parent = dirNode(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '');
    const id = idFor();
    dirIds.set(dir, id);
    const inDir = files.filter((f) => f.path.startsWith(`${dir}/`));
    nodes.push({ id, label: `${dir.split('/').pop()}/`, parent, sublabel: `${inDir.length}개 · +${sum(inDir, 'add')} −${sum(inDir, 'del')}` });
    return id;
  };
  for (const f of shown) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    nodes.push({ id: idFor(), label: f.path.split('/').pop() ?? f.path, parent: dirNode(dir), sublabel: `+${f.add} −${f.del}` });
  }
  if (files.length > shown.length) nodes.push({ id: idFor(), label: `외 ${files.length - shown.length}개`, parent: 'root' });
  return {
    schema_version: 1,
    diagram_type: 'tree',
    meta: { title: '바뀐 곳', subtitle: '이번 작업에서 바뀐 폴더·파일(+추가한 줄 −지운 줄)', locale: 'ko', output: 'change-tree.html' },
    layout: { direction: 'right' },
    nodes,
  };
}

/** 저장 위치: 소유자 폴더 아래 업무 폴더(저장소 읽기 규칙상 소유자만 연다) */
export const archifyPath = (ownerId: string, taskId: string, revision: number) => `${ownerId}/${taskId}/archify-r${revision}.html`;
