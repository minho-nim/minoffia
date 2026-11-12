// 스킬 모음 저장소의 앱 지도(v0.6.70, 소유자 "스킬 지도를 앱 지도·점검과 똑같이, 분류를 연결"): 앱 점검(floorplan.yml)이
// 스킬 모음 저장소를 훑을 때 폴더별 기본 지도 대신 '분류 → 스킬' 지도를 만든다(AI 없음, 토큰 0).
// 자세한 지도(floorplan architecture.json)와 간략 지도(app-map.json)가 같은 분류·이름·설명을 쓴다.
// 사용: node scripts/skill-arch.mjs <저장소 폴더> <프로젝트 이름> <간략 지도 JSON 경로>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// src/domain/skills.ts SKILL_CATEGORIES와 같은 순서(지도 분류)
export const SKILL_KINDS = ['배포', '화면·디자인', '시험·점검', '문서', '데이터·DB', '보안', '도구', '기타'];
const TOOLS = new Set(['find-skills', 'skill-creator']);
// 분류 → floorplan 칩 종류(그림 색만 다름)
const NODE_KIND = { 배포: 'infra', '화면·디자인': 'ui', '시험·점검': 'test', 문서: 'library', '데이터·DB': 'data', 보안: 'config', 도구: 'script', 기타: 'feature' };

/** SKILL.md 앞머리에서 이름·설명·분류, 본문 첫 한글 제목 */
export function readSkill(md, folder) {
  const head = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const field = (k) => head.match(new RegExp(`^\\s*${k}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
  const name = field('name') || folder;
  const description = field('description');
  const h1 = md.slice(head.length).match(/^#\s+(.+)$/m)?.[1].trim() ?? '';
  const title = /[가-힣]/.test(h1) ? h1 : description.split(/[.。]/)[0].trim().slice(0, 30) || name;
  const cat = field('minoffia-category');
  const category = SKILL_KINDS.includes(cat) ? cat : TOOLS.has(name) ? '도구' : '기타';
  return { name, title, description, category };
}

// 스킬 폴더 목록: .claude/skills/<이름>/SKILL.md, 없으면 맨 위 <이름>/SKILL.md
export function findSkills(root) {
  const out = [];
  for (const base of ['.claude/skills', '']) {
    const dir = path.join(root, base);
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      const f = path.join(dir, d.name, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      const folder = base ? `${base}/${d.name}` : d.name;
      const files = listFiles(path.join(dir, d.name)).map((p) => `${folder}/${p}`);
      out.push({ ...readSkill(fs.readFileSync(f, 'utf8'), d.name), folder, files });
    }
    if (out.length) break;
  }
  return out;
}
function listFiles(dir, pre = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? listFiles(path.join(dir, d.name), `${pre}${d.name}/`) : [`${pre}${d.name}`]));
}

const slug = (s) => s.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'x';

export function skillArchitecture(skills, name) {
  const cats = SKILL_KINDS.filter((c) => skills.some((s) => s.category === c));
  const nodes = [
    { id: 'guide', label: '안내', kind: 'library', summary: '스킬 모음 설명과 AI 작업 규칙', paths: ['*.md'] },
    ...cats.map((c, i) => ({ id: `cat${i}`, label: c, kind: NODE_KIND[c], summary: `${c} 스킬 ${skills.filter((s) => s.category === c).length}개` })),
    ...skills.map((s) => ({ id: `cat${cats.indexOf(s.category)}.${slug(s.name)}`, parent: `cat${cats.indexOf(s.category)}`, label: s.title, kind: NODE_KIND[s.category], summary: s.description.slice(0, 300), paths: [`${s.folder}/**`], tags: [s.name] })),
  ];
  return {
    $schema: 'floorplan/architecture@1',
    project: { name: String(name || 'skills').slice(0, 80), summary: `AI가 일할 때 꺼내 쓰는 스킬 ${skills.length}개를 분류별로 묶은 지도예요.` },
    include: ['code', 'docs', 'config'],
    // 다른 도구용 복사본(.agents/skills)과 지도 자체는 빼고, 맨 위 안내 파일(README 등)은 그대로 둔다
    ignore: ['.agents/**', 'floorplan/**', '.github/**'],
    nodes,
  };
}

/** 간략 지도(앱 지도와 같은 모양): 분류 = 칸, 스킬 = 카드 */
export function skillAppMap(skills) {
  return {
    summary: `스킬 ${skills.length}개, 분류 ${new Set(skills.map((s) => s.category)).size}개. 스킬 설명은 스킬 파일에 적힌 그대로예요.`,
    parts: skills.slice(0, 40).map((s) => ({ name: s.title, kind: s.category, what: s.description.slice(0, 160), folder: s.folder, files: s.files.filter((f) => !/\/(LICENSE|NOTICE)/i.test(f)).slice(0, 8) })),
    by: 'skill',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [root = '.', name = '', mapOut = '/tmp/app-map.json'] = process.argv.slice(2);
  const skills = findSkills(root);
  if (!skills.length) {
    console.error('스킬 폴더(SKILL.md)를 찾지 못했어요.');
    process.exit(1);
  }
  fs.mkdirSync(path.join(root, 'floorplan'), { recursive: true });
  fs.writeFileSync(path.join(root, 'floorplan/architecture.json'), JSON.stringify(skillArchitecture(skills, name), null, 1));
  fs.writeFileSync(mapOut, JSON.stringify(skillAppMap(skills)));
  console.log(`스킬 지도 작성: ${skills.length}개`);
}
