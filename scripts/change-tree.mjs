// 바뀐 곳 구조도(v0.5.21, 소유자 "archify를 내 환경에 맞게"): git diff --numstat을 Archify tree JSON으로 바꾼다.
// 모델 호출 없음(토큰 0). Gemini 개발 워크플로가 이 JSON을 Archify(Apache-2.0, 고정 커밋)로 그려 사진으로 찍어
// 결과 스크린샷과 함께 보낸다 → 올리기 승인(B) 전에 "어디가 바뀌었나"를 한눈에 본다.
// 쓰는 법: git diff --numstat <base> | node change-tree.mjs <owner/repo> > tree.json
import { readFileSync } from 'node:fs';

const MAX_FILES = 40;

/** numstat 한 줄: "추가\t삭제\t경로"(바이너리는 "-") */
export function parseNumstat(text) {
  return text
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((p) => p.length >= 3 && p[2])
    .map(([a, d, path]) => ({ path: path.trim(), add: Number(a) || 0, del: Number(d) || 0 }));
}

/** 폴더 → 파일 나무. 폴더마다 바뀐 줄 수를 더해 보여 준다. 파일이 많으면 앞의 40개만(나머지는 개수만). */
export function changeTree(files, repo) {
  const shown = files.slice(0, MAX_FILES);
  const nodes = [{ id: 'root', label: repo || '저장소', sublabel: `바뀐 파일 ${files.length}개 · +${sum(files, 'add')} −${sum(files, 'del')}` }];
  const dirIds = new Map();
  let n = 0;
  const idFor = () => `n${++n}`;
  const dirNode = (dir) => {
    if (!dir) return 'root';
    if (dirIds.has(dir)) return dirIds.get(dir);
    const parent = dirNode(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '');
    const id = idFor();
    dirIds.set(dir, id);
    const inDir = files.filter((f) => f.path.startsWith(`${dir}/`));
    nodes.push({ id, label: `${dir.split('/').pop()}/`, parent, sublabel: `${inDir.length}개 · +${sum(inDir, 'add')} −${sum(inDir, 'del')}` });
    return id;
  };
  for (const f of shown) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    nodes.push({ id: idFor(), label: f.path.split('/').pop(), parent: dirNode(dir), sublabel: `+${f.add} −${f.del}` });
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

const sum = (fs, k) => fs.reduce((s, f) => s + f[k], 0);

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = parseNumstat(readFileSync(0, 'utf8'));
  process.stdout.write(JSON.stringify(changeTree(files, process.argv[2] ?? ''), null, 1));
}
