// 점검용 기본 지도 틀(v0.5.53, 소유자 목록 28번 1단계): floorplan이 훑은 scan.json의 코드 파일을 폴더별로 묶어
// architecture.json을 만든다(AI 없음). 쉬운 이름·설명은 2단계(Claude 보조 세션)에서 쓴다.
// 사용: node scripts/floorplan-arch.mjs <저장소 폴더> <프로젝트 이름>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KINDS = [
  [/(^|\/)(tests?|__tests__|e2e|spec)(\/|$)/i, 'test'],
  [/(^|\/)(migrations|db|database|schema|prisma)(\/|$)/i, 'data'],
  [/(^|\/)(scripts|bin|tools)(\/|$)/i, 'script'],
  [/(^|\/)(\.github|infra|deploy|docker|terraform)(\/|$)/i, 'infra'],
  [/(^|\/)(functions|api|server|backend|routes)(\/|$)/i, 'service'],
  [/(^|\/)(components|pages|app|ui|views|screens|public|office)(\/|$)/i, 'ui'],
];
const kindOf = (dir) => KINDS.find(([re]) => re.test(dir))?.[1] ?? 'library';
const slug = (s) => s.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'root';

/** 코드 파일 경로 → 폴더 묶음. 한 폴더에 40% 넘게 몰리면 한 단계 더 나눈다(최대 16묶음) */
export function groupFiles(paths) {
  const groups = new Map();
  const add = (key, p) => groups.set(key, [...(groups.get(key) ?? []), p]);
  for (const p of paths) add(p.includes('/') ? p.split('/')[0] : '', p);
  for (const [key, list] of [...groups]) {
    if (!key || list.length <= paths.length * 0.4) continue;
    const subs = new Map();
    for (const p of list) {
      const rest = p.slice(key.length + 1);
      const sub = rest.includes('/') ? `${key}/${rest.split('/')[0]}` : key;
      subs.set(sub, [...(subs.get(sub) ?? []), p]);
    }
    if (subs.size < 2 || groups.size - 1 + subs.size > 16) continue;
    groups.delete(key);
    for (const [s, l] of subs) groups.set(s, l);
  }
  return groups;
}

export function autoArchitecture(scan, name) {
  const code = (scan.files ?? []).filter((f) => f.category === 'code').map((f) => f.path);
  const groups = groupFiles(code);
  const split = new Set([...groups.keys()].filter((k) => k.includes('/')).map((k) => k.split('/')[0]));
  const nodes = [...groups].map(([key, list]) => {
    const label = key || '맨 위 파일';
    // 나눈 폴더 바로 아래 파일(예: src/App.tsx)은 그 폴더 묶음이 '한 단계'만 가진다
    const paths = !key ? list : split.has(key) ? [`${key}/*`] : [`${key}/**`];
    return { id: slug(key), label, kind: kindOf(key), summary: `${label} 폴더 (코드 ${list.length}개)`, paths };
  });
  return { $schema: 'floorplan/architecture@1', project: { name: String(name || 'project').slice(0, 80), summary: '자동으로 만든 기본 지도(폴더별). 쉬운 설명은 아직 없음.' }, nodes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = process.argv[2] || '.';
  const scan = JSON.parse(fs.readFileSync(path.join(root, 'floorplan/.cache/scan.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'floorplan/architecture.json'), JSON.stringify(autoArchitecture(scan, process.argv[3]), null, 1));
  console.log('architecture.json 작성');
}
