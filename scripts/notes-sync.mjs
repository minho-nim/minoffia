// 옵시디언 노트 보관함 쌓기(v0.5.62, 소유자 2026-11-09 "Graphify·점검·앱 지도·Archify를 옵시디언에"): GitHub Actions가 부른다. AI 없음.
// 보관함 = 비공개 GitHub 저장소(기본 minho-nim/minoffia-notes). 자동으로 만드는 파일만 덮어쓰고 지우며, '내 메모/'는 절대 건드리지 않는다.
// 사용:
//   node scripts/notes-sync.mjs health  <notes> <프로젝트> <health.json> [지도.png] [지도.html]
//   node scripts/notes-sync.mjs archify <notes> <프로젝트> <업무> <버전> <그림.png> [그림.html] [요약.txt]
//   node scripts/notes-sync.mjs graph   <notes> <프로젝트> <graphify obsidian 폴더>
//   node scripts/notes-sync.mjs remove  <notes> <프로젝트> [업무]
//   node scripts/notes-sync.mjs version <notes> <프로젝트> <entry.json>   (v0.6.89 버전 노트)
//   node scripts/notes-sync.mjs backfill <notes> 전체 <history.json>      (v0.6.90 지난 기록 채우기)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_URL = 'https://minlab-ai-office.pages.dev/';
export const MY_NOTES = '내 메모';
/** 앱 지도 노트 이름(v0.6.98 소유자 "프로젝트(앱 지도)처럼 해야 분류가"): '<프로젝트>(앱 지도)' */
export const mapName = (project) => `${project}(앱 지도)`;

/** 폴더·파일 이름으로 쓸 수 있게(옵시디언·윈도·휴대폰에서 문제 되는 글자 빼기) */
export function safeName(s) {
  const t = String(s ?? '').replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60).trim();
  return t || '이름 없음';
}

const SEV = { high: '중요', medium: '고칠 만함', low: '사소' };

/** 점검 노트: 최신 결과를 위에, 지난 결과는 '지난 점검'에 날짜별로 쌓는다(최대 20번) */
export function healthNote(project, report, previous = '') {
  const date = String(report.checkedAt ?? '').slice(0, 16).replace('T', ' ');
  const s = report.summary ?? {};
  const line = `- ${date} · 중요 ${s.high ?? 0} · 고칠 만함 ${s.medium ?? 0} · 사소 ${s.low ?? 0}`;
  const old = (previous.split('## 지난 점검')[1] ?? '').split('\n').filter((l) => l.startsWith('- ')).filter((l) => l !== line);
  const issues = (report.issues ?? []).map((i) => `| ${SEV[i.severity] ?? '참고'} | ${String(i.title ?? i.kind).replace(/\|/g, '/')} | ${(i.items ?? []).slice(0, 5).join(', ').replace(/\|/g, '/')} |`);
  return [
    '---', `프로젝트: "${project}"`, 'tags: [minoffia/점검]', '---',
    `# ${project} 점검`, '',
    `> [!summary] 최근 점검 ${date}`, `> 중요 **${s.high ?? 0}** · 고칠 만함 **${s.medium ?? 0}** · 사소 **${s.low ?? 0}**${report.files ? ` · 코드 ${report.files}개` : ''}`, '',
    issues.length ? ['| 정도 | 내용 | 파일 |', '|---|---|---|', ...issues].join('\n') : '걱정할 문제가 없어요.', '',
    '## 앱 지도', `![[${project}/앱 지도.png]]`, `[[${project}/앱 지도.html|원본 지도(PC에서 열기)]] · [미노피아에서 크게 보기](${APP_URL})`, '',
    '## 지난 점검', line, ...old.slice(0, 19), '',
  ].join('\n');
}

// ── 구조(v0.6.94, 소유자 "프로젝트별 파일 구조도"): 링크 없이 그림·글자만(그래프에 점이 늘지 않게) ──
const FOLDER_HINT = {
  src: '앱 소스', components: '화면 조각', pages: '화면(페이지)', app: '화면(라우트)', routes: '화면(라우트)', hooks: '화면 공용 동작',
  domain: '업무 규칙', lib: '공용 도구', utils: '공용 도구', data: '저장·불러오기', api: '서버와 주고받기', services: '외부 연결',
  store: '상태 저장', styles: '모양(CSS)', assets: '그림·글꼴', public: '그대로 내보내는 파일', types: '자료 모양(타입)',
  supabase: 'Supabase', functions: '서버 함수', migrations: 'DB 변경 기록', tests: '시험', test: '시험', e2e: '화면 시험',
  scripts: '도구 스크립트', docs: '문서', archive: '지난 기록', icons: '아이콘', fonts: '글꼴', workflow: '업무 흐름', '.github': 'GitHub 설정', workflows: '자동 작업(Actions)', '.agents': 'AI 스킬(Codex)', '.claude': 'AI 스킬(Claude)',
};
/** 파일 목록 → 폴더 나무(3단계까지, 폴더마다 설명·파일 수). 스킬 폴더 안은 펼치지 않는다 */
export function folderTree(files, map, depth = 3) {
  if (!Array.isArray(files) || !files.length) return [];
  const count = new Map();
  for (const f of files) {
    const parts = String(f).split('/').slice(0, -1);
    const stop = parts[0] === '.agents' || parts[0] === '.claude' ? 1 : depth;
    for (let i = 1; i <= Math.min(parts.length, stop); i++) { const k = parts.slice(0, i).join('/'); count.set(k, (count.get(k) ?? 0) + 1); }
  }
  const desc = new Map((map?.parts ?? []).filter((p) => p.folder).map((p) => [p.folder.replace(/\/$/, ''), p.name]));
  const dirs = [...count.keys()].sort((a, b) => a.localeCompare(b));
  const rootFiles = files.filter((f) => !String(f).includes('/')).length;
  const lines = dirs.map((d) => {
    const name = d.split('/').pop();
    const note = desc.get(d) ?? FOLDER_HINT[name] ?? '';
    return `${'  '.repeat(d.split('/').length - 1)}${name}/`.padEnd(32) + `${note ? `${note} ` : ''}(${count.get(d)})`;
  });
  return ['## 폴더 구조', `파일 ${files.length}개${rootFiles ? ` · 맨 위 파일 ${rootFiles}개` : ''} · 3단계까지`, '```', ...lines.slice(0, 120), ...(lines.length > 120 ? [`… 폴더 ${lines.length - 120}개 더`] : []), '```', ''];
}
/** 앱 지도 부분을 화면 → 기능 → 서버 → 데이터 흐름 그림(Mermaid)으로 */
export function flowMermaid(map) {
  const kinds = MAP_KINDS.filter((k) => k !== '설정' && (map?.parts ?? []).some((p) => p.kind === k));
  if (kinds.length < 2) return [];
  const q = (t) => String(t ?? '').replace(/["`<>{}|[\]]/g, ' ').slice(0, 30);
  const out = ['## 흐름', '```mermaid', 'flowchart LR'];
  kinds.forEach((k, i) => {
    out.push(`  subgraph K${i}["${k}"]`);
    map.parts.filter((p) => p.kind === k).slice(0, 5).forEach((p, j) => out.push(`    K${i}_${j}["${q(p.name)}"]`));
    out.push('  end');
  });
  for (let i = 1; i < kinds.length; i++) out.push(`  K${i - 1} --> K${i}`);
  out.push('```', '');
  return out;
}

/** 이미 있는 앱 지도 노트에 폴더 구조·흐름 그림을 넣거나 바꾼다(지난 기록 채우기 때, 점검 없이) */
export function upgradeAppMap(text, files) {
  const t = String(text ?? '');
  const parts = [];
  let kind = '';
  for (const line of t.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { kind = MAP_KINDS.includes(h[1]) ? h[1] : ''; continue; }
    const r = kind && line.match(/^\| \*\*(.+?)\*\* \| (.*?) \| (.*?) \|$/);
    if (r) parts.push({ kind, name: r[1], what: r[2], folder: r[3].endsWith('/') ? r[3].slice(0, -1) : '', files: [] });
  }
  const map = { parts };
  const add = [...flowMermaid(map), ...folderTree(files, map)].join('\n');
  // 예전에 넣은 흐름·폴더 구조 칸은 빼고 다시
  const base = t.replace(/## 흐름\n```mermaid[\s\S]*?```\n+/g, '').replace(/## 폴더 구조\n[\s\S]*?```\n[\s\S]*?```\n+/g, '');
  if (!add) return base;
  const at = base.search(/^!\[\[.*앱 지도\)?\.png\]\]/m);
  return at >= 0 ? `${base.slice(0, at)}${add}\n${base.slice(at)}` : `${base.trimEnd()}\n\n${add}\n`;
}

/** 앱 지도 노트(v0.5.94 소유자 "옵시디언에서는 앱 지도만 프로젝트별로"): 쉬운 지도 + 파일 위치. 나중에 개발 AI도 참고한다 */
export const MAP_KINDS = ['화면', '기능', '서버', '데이터', '설정'];
export function appMapNote(project, report) {
  const map = report.appMap;
  const date = String(report.checkedAt ?? '').slice(0, 16).replace('T', ' ');
  const cell = (t) => String(t ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  const body = map?.parts?.length
    ? MAP_KINDS.flatMap((kind) => {
        const parts = map.parts.filter((p) => p.kind === kind);
        if (!parts.length) return [];
        return [`## ${kind}`, '| 부분 | 하는 일 | 위치 |', '|---|---|---|', ...parts.map((p) => `| **${cell(p.name)}** | ${cell(p.what)} | ${cell(p.folder ? `${p.folder}/` : p.files[0] ?? '')} |`), ''];
      })
    : ['아직 쉬운 지도가 없어요. 미노피아 프로젝트 탭의 "앱 지도·점검"에서 다시 점검하세요.', ''];
  return [
    '---', `프로젝트: "${project}"`, 'tags: [minoffia/앱지도]', `점검: "${date}"`, '---',
    `# ${project} 앱 지도`, '',
    map?.summary ? `> [!summary] ${cell(map.summary)}` : '', '',
    ...body,
    ...flowMermaid(map),
    ...folderTree(report.tree, map),
    `![[${project}/${mapName(project)}.png]]`, '',
    `${date} 점검 기준 · [미노피아 열기](${APP_URL})`, '',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** 업무 노트: 결과 버전마다 구조도 그림을 위에서부터 쌓는다 */
export function archifyNote(project, task, revision, image, summary = '', previous = '') {
  const head = `## 결과 v${revision}`;
  const block = [head, summary.trim() ? `> ${summary.trim().slice(0, 600).replace(/\n/g, '\n> ')}` : '', `![[${project}/업무/${image}]]`, `[미노피아에서 크게 보기](${APP_URL})`, ''].filter((x) => x !== '').join('\n');
  const rest = previous.includes('## 결과 v') ? previous.slice(previous.indexOf('## 결과 v')).split(/(?=^## 결과 v)/m).filter((b) => !b.startsWith(`${head}\n`)) : [];
  return ['---', `프로젝트: "${project}"`, 'tags: [minoffia/업무]', '---', `# ${task}`, `[[${project}/점검|${project}]]의 업무`, '', block, '', ...rest].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Graphify 노트의 [[링크]]를 이 프로젝트 폴더 안으로 고정(프로젝트끼리 같은 이름이 섞이지 않게) */
export function scopeLinks(text, prefix, names) {
  return text.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g, (m, name, hash = '', alias) => (names.has(name) ? `[[${prefix}/${name}${hash}${alias ?? `|${name}`}]]` : m));
}

/** 캔버스(graph.canvas)의 노트 경로도 프로젝트 폴더 안으로 */
export function scopeCanvas(text, prefix) {
  const c = JSON.parse(text);
  for (const n of c.nodes ?? []) if (n.type === 'file' && typeof n.file === 'string') n.file = `${prefix}/${n.file.split('/').pop()}`;
  return JSON.stringify(c);
}

/** 홈 노트: 프로젝트 목록과 각 노트로 가는 링크 */
export function homeNote(projects) {
  return [
    '# minoffia', '',
    '> [!info] 프로젝트마다 앱 지도와 버전 노트를 자동으로 만들어요. 직접 쓰는 메모는 **내 메모** 폴더에 두세요(자동으로 건드리지 않아요).', '',
    // 홈 → 프로젝트만(앱 지도는 프로젝트 노트에서 이어진다)
    ...projects.map((p) => (p.note ? `- [[${p.name}]]` : `- ${p.name}`)),
    '', '사무실 그림: [[미노피아 사무실.canvas|미노피아 사무실]]', '', `[미노피아 열기](${APP_URL})`, '',
  ].join('\n');
}

/** 앱 지도 말고 예전에 자동으로 만든 것(점검·업무 구조도·코드 그래프·원본 지도)을 지운다(v0.5.94). 내 메모는 건드리지 않는다 */
export const OLD_AUTO = ['점검.md', '업무', '코드 그래프', '앱 지도.html'];

/** 예전 이름 '앱 지도.md·png'는 '<프로젝트>(앱 지도)'로 바꾼다(그림 링크도) */
function migrateMap(dir, project) {
  const md = path.join(dir, `${mapName(project)}.md`);
  const oldMd = path.join(dir, '앱 지도.md');
  if (fs.existsSync(oldMd) && !fs.existsSync(md)) fs.writeFileSync(md, read(oldMd).replaceAll(`![[${project}/앱 지도.png]]`, `![[${project}/${mapName(project)}.png]]`));
  fs.rmSync(oldMd, { force: true });
  const oldPng = path.join(dir, '앱 지도.png');
  if (fs.existsSync(oldPng)) fs.renameSync(oldPng, path.join(dir, `${mapName(project)}.png`));
}
function scanProjects(notes) {
  return fs.readdirSync(notes, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== MY_NOTES && !SHARED.includes(d.name))
    .map((d) => {
      const dir = path.join(notes, d.name);
      for (const old of OLD_AUTO) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
      migrateMap(dir, d.name);
      return { name: d.name, map: fs.existsSync(path.join(dir, `${mapName(d.name)}.md`)), note: fs.existsSync(path.join(dir, `${d.name}.md`)) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// ── 사무실 그림판(v0.6.94, 소유자 "캔버스"): 보관함 맨 위 '미노피아 사무실.canvas'. 점검·배포 때마다 다시 쓴다.
// 내용은 앱 사무실 지도(src/components/OfficeMap.tsx)와 같다(이름이 같은지는 시험이 확인).
export const OFFICE_CLOUD = {
  nodes: [
    ['app', '휴대폰 앱', '아이폰 홈 화면 앱(미노피아)', 0, 0, '6'],
    ['cf', 'Cloudflare Pages', '화면 파일을 내려 준다(release 브랜치)', -340, 200, '4'],
    ['sb', 'Supabase', 'DB · 서버 함수 · 알림 · 파일', 0, 200, '4'],
    ['gh', 'GitHub', '저장소와 Actions(검사·배포·스킬 넣기·점검)', 340, 200, '4'],
    ['linear', 'Linear', 'Codex에게 업무를 넘기는 통로', -510, 420, '3'],
    ['codexc', 'Codex 클라우드', '주 개발 AI가 일하는 곳', -255, 420, '5'],
    ['routine', 'Claude 루틴', '보조 개발 AI가 일하는 곳', 0, 420, '5'],
    ['gem', 'Gemini API', '채점·초안·질문 답(무료 키)', 255, 420, '3'],
    ['search', 'Tavily·Firecrawl 검색', '웹 조사: Tavily 먼저, 안 되면 Firecrawl. 찾은 글을 Gemini가 정리(카드 없는 무료 크레딧).', 255, 540, '3'],
    ['notes', '노트 보관함', '앱 지도·버전 노트(이 Obsidian)', 510, 420, '3'],
  ],
  links: [['app', 'cf', '화면 받기'], ['app', 'sb', '로그인 · 자료'], ['sb', 'gh', '저장소 읽기 · Actions'], ['sb', 'linear', '업무 맡기기'], ['linear', 'codexc', '위임'], ['codexc', 'sb', '결과 보내기'], ['sb', 'routine', '업무 맡기기'], ['routine', 'sb', '결과 보내기'], ['sb', 'gem', '채점 · 초안'], ['sb', 'search', '웹 조사'], ['gh', 'cf', '배포'], ['gh', 'notes', '앱 지도 · 버전 노트'], ['codexc', 'gh', '작업 브랜치'], ['routine', 'gh', '작업 브랜치']],
};
export const OFFICE_FLOW = [['s-req', '요청'], ['s-plan', '기획'], ['g-a', '기획 승인'], ['s-dev', '개발'], ['s-rev', '채점'], ['g-b', '올리기 승인'], ['s-pr', 'PR'], ['g-c', '배포 승인'], ['s-dep', '배포']];
export const OFFICE_WHO = [['owner', '나(소유자)', ['s-req', 'g-a', 'g-b', 'g-c']], ['pm', 'Claude PM', ['s-plan']], ['codex', 'Codex', ['s-dev']], ['claude', 'Claude', ['s-dev']], ['gemini', 'Gemini A·B', ['s-rev']], ['search', 'Tavily', ['s-req']], ['mino', '미노(CI)', ['s-pr', 's-dep']], ['server', '서버(자동)', ['g-a', 's-rev']]];
export function officeCanvas(projects) {
  const nodes = [];
  const edges = [];
  const W = 220, H = 90;
  // 1) 클라우드
  nodes.push({ id: 'grp-cloud', type: 'group', label: '클라우드 — 서비스끼리 무엇이 오가나', x: -660, y: -80, width: 1400, height: 720 });
  for (const [id, label, desc, x, y, color] of OFFICE_CLOUD.nodes) nodes.push({ id: `c-${id}`, type: 'text', text: `**${label}**\n${desc}`, x: x - W / 2, y, width: W, height: H, color });
  OFFICE_CLOUD.links.forEach(([a, b, label], i) => edges.push({ id: `ce${i}`, fromNode: `c-${a}`, toNode: `c-${b}`, label }));
  // 2) 업무 흐름과 역할
  const fy = 780, wy = 1000, step = 170;
  nodes.push({ id: 'grp-role', type: 'group', label: '역할 — 누가 업무의 어디를 맡나 (주황 = 소유자 승인)', x: -660, y: fy - 80, width: Math.max(1400, OFFICE_FLOW.length * step + 80), height: 420 });
  OFFICE_FLOW.forEach(([id, label], i) => nodes.push({ id: `f-${id}`, type: 'text', text: `**${label}**`, x: -620 + i * step, y: fy, width: 140, height: 60, color: id.startsWith('g-') ? '2' : undefined }));
  for (let i = 1; i < OFFICE_FLOW.length; i++) edges.push({ id: `fe${i}`, fromNode: `f-${OFFICE_FLOW[i - 1][0]}`, toNode: `f-${OFFICE_FLOW[i][0]}`, fromSide: 'right', toSide: 'left' });
  OFFICE_WHO.forEach(([id, label, does], i) => {
    nodes.push({ id: `w-${id}`, type: 'text', text: `**${label}**`, x: -620 + i * 195, y: wy, width: 150, height: 60, color: id === 'owner' ? '6' : '5' });
    does.forEach((d, j) => edges.push({ id: `we-${id}-${j}`, fromNode: `w-${id}`, toNode: `f-${d}`, fromSide: 'top', toSide: 'bottom' }));
  });
  // 3) 프로젝트(노트로 바로 열림)
  const px = 1040;
  nodes.push({ id: 'grp-proj', type: 'group', label: '프로젝트 — 누르면 프로젝트 노트', x: px - 40, y: -80, width: 560, height: Math.max(300, Math.ceil(projects.length / 2) * 110 + 80) });
  projects.forEach((p, i) => nodes.push({ id: `p-${i}`, type: 'file', file: p.note ? `${p.name}/${p.name}.md` : `${p.name}/${mapName(p.name)}.md`, x: px + (i % 2) * 250, y: (Math.floor(i / 2)) * 110, width: 230, height: 90 }));
  return JSON.stringify({ nodes: nodes.map((n) => Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined))), edges }, null, 1);
}

function finish(notes) {
  fs.mkdirSync(path.join(notes, MY_NOTES), { recursive: true });
  const keep = path.join(notes, MY_NOTES, '여기에 메모하세요.md');
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, '# 내 메모\n\n이 폴더는 자동으로 바꾸거나 지우지 않아요.\n');
  const graphCfg = path.join(notes, '.obsidian', 'graph.json');
  if (!fs.existsSync(graphCfg)) {
    fs.mkdirSync(path.dirname(graphCfg), { recursive: true });
    const color = (hex) => ({ a: 1, rgb: parseInt(hex, 16) });
    fs.writeFileSync(graphCfg, JSON.stringify({ colorGroups: [
      { query: 'tag:#minoffia/앱지도', color: color('4cb87a') },
      { query: `path:"${MY_NOTES}"`, color: color('b06bd6') },
    ] }, null, 1));
  }
  const projects = scanProjects(notes);
  fs.writeFileSync(path.join(notes, '홈.md'), homeNote(projects));
  fs.writeFileSync(path.join(notes, '미노피아 사무실.canvas'), officeCanvas(projects.filter((p) => p.note || p.map)));
}

// ── 버전 노트(v0.6.89, 소유자 "버전마다 쓴 스킬·만든 AI로 이어지게, 너무 복잡하지 않게") ──
// 선은 버전 → 스킬, 버전 → AI, 버전 → '<프로젝트> 버전' 묶음만. '쓴 스킬'·'개발' 묶음은 숫자 목록(링크 없음)이라 선을 늘리지 않는다.
// 스킬·AI 노트는 모든 프로젝트가 같이 쓰는 공용 폴더 하나씩.
export const SHARED = ['스킬', 'AI', 'MCP'];
/** MCP 노트 이름: '<이름> (MCP)'(스킬 이름과 섞이지 않게) */
export const mcpNote = (n) => `${n} (MCP)`;
const MCP_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const ENTRY_MARK = /<!-- minoffia:entries (.*?) -->/s;
const SKILL_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const AGENTS = ['Codex', 'Claude', 'Gemini'];

/** 작은 버전 이름: package.json 버전이 있으면 v1.2.3, 없으면 날짜(2026.11.13) */
export function versionName(entry) {
  if (/^\d+\.\d+\.\d+[\w.-]*$/.test(entry.version ?? '')) return `v${entry.version}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') ? entry.date.replaceAll('-', '.') : '날짜 없음';
}
/** 큰 버전(v0.6.89 → v0.6, 2026.11.13 → 2026.11). 노트는 큰 버전마다 하나(v0.6.97 소유자 "버전 점이 너무 많다") */
export const groupName = (n) => String(n).split('.').slice(0, 2).join('.');
const FULL = /^(v\d+\.\d+\.\d+[\w.-]*|\d{4}\.\d{2}\.\d{2})$/;
/** 노트에 숨겨 둔 업무 목록 읽기 */
export function readEntries(text) {
  try {
    const m = String(text ?? '').match(ENTRY_MARK);
    const list = m ? JSON.parse(m[1]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
/** 같은 작은 버전의 같은 업무(제목)는 새 것으로 바꾸고, 아니면 더한다. v = 작은 버전 이름 */
export function addEntry(list, entry) {
  const e = {
    v: FULL.test(entry.v ?? '') ? entry.v : versionName(entry),
    task: safeName(entry.task || '업무'),
    date: /^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') ? entry.date : '',
    score: /^\d{1,3}$/.test(String(entry.score ?? '')) ? Number(entry.score) : null,
    pr: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(entry.pr ?? '') ? entry.pr : '',
    // Claude 대화로 하지 않은 것은 모두 Codex(소유자 2026-11-13)
    agent: AGENTS.includes(entry.agent) ? entry.agent : 'Codex',
    skills: [...new Set((entry.skills ?? []).filter((n) => SKILL_RE.test(n)))].slice(0, 12),
    mcp: [...new Set((entry.mcp ?? []).filter((n) => MCP_RE.test(n)))].slice(0, 8),
  };
  return [...list.filter((x) => !(x.task === e.task && (x.v ?? e.v) === e.v)), e];
}
const cmp = (a, b) => b.localeCompare(a, undefined, { numeric: true });
/** 큰 버전 노트: 맨 위에 만든 AI·쓴 스킬 링크(한 번씩), 아래는 작은 버전마다 칸(링크 없이 글자) */
export function versionNote(project, group, list) {
  const sorted = [...list].sort((a, b) => cmp(a.v, b.v));
  const agents = [...new Set(sorted.map((e) => e.agent))];
  const skills = [...new Set(sorted.flatMap((e) => e.skills))].sort();
  const mcps = [...new Set(sorted.flatMap((e) => e.mcp ?? []))].sort();
  const body = sorted.flatMap((e) => [
    `## ${e.v} · ${e.task}`,
    `- ${[e.date, e.score != null ? `점수 ${e.score}` : '', e.pr ? `[PR #${e.pr.split('/').pop()}](${e.pr})` : '', e.agent, e.skills.length ? `스킬 ${e.skills.join(', ')}` : '', e.mcp?.length ? `MCP ${e.mcp.join(', ')}` : ''].filter(Boolean).join(' · ')}`,
    '',
  ]);
  return [
    '---', 'tags: [minoffia/버전]', `프로젝트: "${project}"`, `버전: ${group}`, `작은 버전: ${sorted.length}`, '---',
    `# ${project} ${group}`, '',
    `만든 AI: ${agents.map((a) => `[[${a}]]`).join(' ') || '없음'}`,
    `쓴 스킬: ${skills.length ? skills.map((n) => `[[${n}]]`).join(' ') : '없음'}`,
    `쓴 MCP: ${mcps.length ? mcps.map((n) => `[[${mcpNote(n)}]]`).join(' ') : '없음'}`, '',
    ...body,
    `← [[${project} 버전]]`, '',
    `<!-- minoffia:entries ${JSON.stringify(sorted)} -->`, '',
  ].join('\n');
}
export function hubNotes(project, groups) {
  const names = Object.keys(groups).sort(cmp);
  const total = names.reduce((n, g) => n + groups[g].length, 0);
  return {
    // 프로젝트 → 프로젝트 버전 · 앱 지도만(소유자 "프로젝트 > 프로젝트 버전으로만 묶고, 앱 지도는 프로젝트에서")
    [`${project}.md`]: ['---', 'tags: [minoffia/프로젝트]', '---', `# ${project}`, '', `- [[${project} 버전]] · 큰 버전 ${names.length}개 · 작은 버전 ${total}개`, `- [[${mapName(project)}]] · 기능 표 · 흐름 그림 · 폴더 구조`, '', `[미노피아 열기](${APP_URL})`, ''].join('\n'),
    [`${project} 버전.md`]: ['---', 'tags: [minoffia/묶음]', '---', `# ${project} 버전`, '', '> [!info] 큰 버전마다 노트 하나예요. 누르면 그 안의 작은 버전들과 만든 AI·쓴 스킬이 보여요. 배포할 때마다 자동으로 더해져요.', '',
      ...names.map((g) => {
        const latest = [...groups[g]].sort((a, b) => cmp(a.v, b.v))[0];
        return `- [[${project} ${g}|${g}]] · 작은 버전 ${groups[g].length}개${latest ? ` · 최근 ${latest.v} ${latest.task.slice(0, 40)}` : ''}`;
      }),
      '', `← [[${project}]]`, ''].join('\n'),
  };
}
export const mcpStub = (n) => `---\ntags: [minoffia/MCP]\n---\n# ${n} (MCP)\n\nAI가 쓰는 외부 연결(MCP, 공용 노트). 이 MCP를 쓴 버전은 아래 백링크에 모여요.\n`;
export const skillStub = (n) => `---\ntags: [minoffia/스킬]\n---\n# ${n}\n\n스킬(공용 노트). 이 스킬을 쓴 버전은 아래 백링크에 모여요.\n`;
export const aiStub = (n) => `---\ntags: [minoffia/AI]\n---\n# ${n}\n\n개발 AI(공용 노트). 이 AI가 만든 버전은 아래 백링크에 모여요.\n`;

/** 버전 노트를 큰 버전마다 하나로 모으고(예전 작은 버전 파일은 합친 뒤 지움), 버전 목록·프로젝트 노트를 다시 쓴다 */
function writeHubs(dir, project, vdir) {
  for (const f of [`${project} 쓴 스킬.md`, `${project} 개발.md`]) fs.rmSync(path.join(dir, f), { force: true });
  const pre = `${project} `;
  const groups = {};
  for (const f of fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((x) => x.endsWith('.md')) : []) {
    const name = (f.startsWith(pre) ? f.slice(pre.length) : f).slice(0, -3);
    // 예전 파일 이름이 작은 버전(v0.6.89 · 2026.11.13)이면 그 이름을 업무에 붙여 큰 버전으로 옮긴다
    const small = FULL.test(name);
    const g = small ? groupName(name) : name;
    for (const e of readEntries(read(path.join(vdir, f)))) groups[g] = addEntry(groups[g] ?? [], { ...e, v: e.v ?? (small ? name : undefined) });
    if (small || !f.startsWith(pre)) fs.rmSync(path.join(vdir, f));
  }
  for (const [g, list] of Object.entries(groups)) fs.writeFileSync(path.join(vdir, `${pre}${g}.md`), versionNote(project, g, list));
  for (const [f, text] of Object.entries(hubNotes(project, groups))) fs.writeFileSync(path.join(dir, f), text);
}
const AI_DESC = {
  Codex: '주 개발. Linear로 업무를 받아 Codex 클라우드에서 개발하고, 결과를 미노피아로 보낸다.',
  Claude: 'PM과 보조 개발. 요청을 기획서로 나누고, 루틴으로 받아 개발하거나 올리기 승인 뒤 PR을 연다.',
  Gemini: '결과 채점(기본)과 분배 보조. 무료 키만 쓴다.',
};
export const aiNote = (n) => `---\ntags: [minoffia/AI]\n---\n# ${n}\n\n${AI_DESC[n] ?? '개발 AI.'}\n\n이 AI가 만든 버전은 아래 백링크에 모여요.\n`;
/** 스킬 노트: 설명·분류·함께 쓰는 스킬(링크)·들어 있는 프로젝트(글자만, 선을 늘리지 않게) */
export function skillNote(s, projects) {
  return [
    '---', 'tags: [minoffia/스킬]', `분류: ${s.category || '기타'}`, '---',
    `# ${s.name}${s.title ? ` · ${s.title}` : ''}`, '',
    s.description || '설명 없음.', '',
    ...(s.related?.length ? [`함께 쓰는 스킬: ${s.related.map((r) => `[[${r}]]`).join(' ')}`, ''] : []),
    '## 들어 있는 프로젝트', projects.length ? projects.join(', ') : '없음', '',
    '이 스킬을 쓴 버전은 아래 백링크에 모여요.', '',
  ].join('\n');
}
/** 지난 기록 한 번에 채우기(notes-history.mjs가 만든 JSON). 이미 있는 버전 노트(배포 때 만든 것)는 건드리지 않는다 */
const AUTO_FILES = /^(앱 지도|.*\(앱 지도\))\.(md|png|html)$|^점검\.md$/;
/** 지금 프로젝트 목록에 없는 예전 폴더(이름이 바뀐 프로젝트 등)는 자동 파일만 있을 때 지운다(직접 쓴 파일이 있으면 그대로) */
function removeOrphans(notes, names) {
  for (const d of fs.readdirSync(notes, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name === MY_NOTES || SHARED.includes(d.name) || names.has(d.name)) continue;
    const dir = path.join(notes, d.name);
    const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((f) => f.isFile());
    const own = files.filter((f) => {
      const rel = path.relative(dir, path.join(f.parentPath ?? f.path, f.name));
      return !(AUTO_FILES.test(rel) || rel === `${d.name}.md` || rel === `${d.name} 버전.md` || rel.startsWith(`버전${path.sep}`) || rel.startsWith(`업무${path.sep}`) || rel.startsWith(`코드 그래프${path.sep}`));
    });
    if (!own.length) fs.rmSync(dir, { recursive: true, force: true });
  }
}
function writeBackfill(notes, data) {
  removeOrphans(notes, new Set((data.projects ?? []).map((p) => safeName(p.name))));
  for (const p of data.projects ?? []) {
    const project = safeName(p.name);
    const dir = path.join(notes, project);
    const vdir = path.join(dir, '버전');
    fs.mkdirSync(vdir, { recursive: true });
    // 다시 채울 때: 배포 때 만든 업무(PR 있음)만 남기고 나머지는 이번 기록으로 다시 쓴다
    writeHubs(dir, project, vdir);
    const fresh = {};
    for (const v of p.versions ?? []) { const e = addEntry([], v)[0]; fresh[groupName(e.v)] = [...(fresh[groupName(e.v)] ?? []), e]; }
    for (const f of fs.readdirSync(vdir).filter((x) => x.endsWith('.md'))) {
      const g = f.slice(project.length + 1, -3);
      const kept = readEntries(read(path.join(vdir, f))).filter((e) => e.pr);
      if (!kept.length && !fresh[g]) fs.rmSync(path.join(vdir, f));
      else if (!fresh[g]) fs.writeFileSync(path.join(vdir, f), versionNote(project, g, kept));
    }
    for (const [g, list] of Object.entries(fresh)) {
      const file = path.join(vdir, `${project} ${g}.md`);
      const kept = readEntries(read(file)).filter((e) => e.pr);
      fs.writeFileSync(file, versionNote(project, g, list.reduce((acc, e) => (acc.some((k) => k.v === e.v && k.task === e.task) ? acc : [...acc, e]), kept)));
    }
    writeHubs(dir, project, vdir);
    const am = path.join(dir, `${mapName(project)}.md`);
    migrateMap(dir, project);
    // 모든 프로젝트에 구조를(v0.6.95 소유자 "전체적으로"): 앱 지도가 아직 없으면 폴더 구조만 있는 앱 지도를 만든다(기능 표는 점검 때)
    const base = fs.existsSync(am) ? read(am) : ['---', `프로젝트: "${project}"`, 'tags: [minoffia/앱지도]', '---', `# ${project} 앱 지도`, '', '> [!info] 기능 표와 흐름 그림은 미노피아 앱에서 이 프로젝트를 점검하면 생겨요.', ''].join('\n');
    if (Array.isArray(p.files) && p.files.length) fs.writeFileSync(am, upgradeAppMap(base, p.files));
  }
  const SKILLS = path.join(notes, '스킬');
  fs.mkdirSync(SKILLS, { recursive: true });
  for (const s of data.skills ?? []) {
    if (!SKILL_RE.test(s.name)) continue;
    const users = (data.projects ?? []).filter((p) => (p.skills ?? []).includes(s.name)).map((p) => safeName(p.name));
    fs.writeFileSync(path.join(SKILLS, `${s.name}.md`), skillNote(s, users));
  }
  for (const n of new Set((data.projects ?? []).flatMap((p) => (p.versions ?? []).flatMap((v) => v.mcp ?? [])))) {
    if (!MCP_RE.test(n)) continue;
    const f = path.join(notes, 'MCP', `${mcpNote(n)}.md`);
    if (!fs.existsSync(f)) (fs.mkdirSync(path.dirname(f), { recursive: true }), fs.writeFileSync(f, mcpStub(n)));
  }
  fs.mkdirSync(path.join(notes, 'AI'), { recursive: true });
  for (const n of AGENTS) fs.writeFileSync(path.join(notes, 'AI', `${n}.md`), aiNote(n));
  fs.rmSync(path.join(notes, 'AI', '직접.md'), { force: true });
}

function writeVersion(notes, project, entry) {
  const dir = path.join(notes, project);
  const vdir = path.join(dir, '버전');
  fs.mkdirSync(vdir, { recursive: true });
  writeHubs(dir, project, vdir);
  const e = addEntry([], entry)[0];
  const file = path.join(vdir, `${project} ${groupName(e.v)}.md`);
  const list = addEntry(readEntries(read(file)), e);
  fs.writeFileSync(file, versionNote(project, groupName(e.v), list));
  writeHubs(dir, project, vdir);
  const last = e;
  for (const n of last.skills) {
    const f = path.join(notes, '스킬', `${n}.md`);
    if (!fs.existsSync(f)) (fs.mkdirSync(path.dirname(f), { recursive: true }), fs.writeFileSync(f, skillStub(n)));
  }
  for (const n of last.mcp ?? []) {
    const f = path.join(notes, 'MCP', `${mcpNote(n)}.md`);
    if (!fs.existsSync(f)) (fs.mkdirSync(path.dirname(f), { recursive: true }), fs.writeFileSync(f, mcpStub(n)));
  }
  const a = path.join(notes, 'AI', `${last.agent}.md`);
  if (!fs.existsSync(a)) (fs.mkdirSync(path.dirname(a), { recursive: true }), fs.writeFileSync(a, aiNote(last.agent)));
}

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const copyIf = (from, to) => from && fs.existsSync(from) && fs.copyFileSync(from, to);

function main([cmd, notes, projectRaw, ...rest]) {
  if (!notes || !fs.existsSync(notes) || !projectRaw) throw new Error('사용법을 확인하세요');
  const project = safeName(projectRaw);
  const dir = path.join(notes, project);
  if (cmd === 'health') {
    const [reportFile, png, html] = rest;
    fs.mkdirSync(dir, { recursive: true });
    void html; // 원본 지도(HTML)는 옵시디언에 올리지 않는다(v0.5.94)
    fs.writeFileSync(path.join(dir, `${mapName(project)}.md`), appMapNote(project, JSON.parse(fs.readFileSync(reportFile, 'utf8'))));
    copyIf(png, path.join(dir, `${mapName(project)}.png`));
    fs.rmSync(path.join(dir, '앱 지도.md'), { force: true });
  } else if (cmd === 'archify') {
    const [taskRaw, revision, png, html, summaryFile] = rest;
    const task = safeName(taskRaw);
    const tdir = path.join(dir, '업무');
    fs.mkdirSync(tdir, { recursive: true });
    const image = `${task}-r${Number(revision) || 1}.png`;
    copyIf(png, path.join(tdir, image));
    copyIf(html, path.join(tdir, `${task}-r${Number(revision) || 1}.html`));
    const note = path.join(tdir, `${task}.md`);
    fs.writeFileSync(note, archifyNote(project, task, Number(revision) || 1, image, read(summaryFile), read(note)));
  } else if (cmd === 'graph') {
    const [vault] = rest;
    const out = path.join(dir, '코드 그래프');
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const files = fs.readdirSync(vault).filter((f) => !f.startsWith('.'));
    const names = new Set(files.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)));
    const prefix = `${project}/코드 그래프`;
    for (const f of files) {
      const src = path.join(vault, f);
      if (!fs.statSync(src).isFile()) continue;
      if (f.endsWith('.md')) fs.writeFileSync(path.join(out, f), scopeLinks(fs.readFileSync(src, 'utf8'), prefix, names));
      else if (f.endsWith('.canvas')) fs.writeFileSync(path.join(out, f), scopeCanvas(fs.readFileSync(src, 'utf8'), prefix));
      else fs.copyFileSync(src, path.join(out, f));
    }
  } else if (cmd === 'version') {
    const [entryFile] = rest;
    writeVersion(notes, project, JSON.parse(fs.readFileSync(entryFile, 'utf8')));
  } else if (cmd === 'backfill') {
    const [dataFile] = rest;
    writeBackfill(notes, JSON.parse(fs.readFileSync(dataFile, 'utf8')));
  } else if (cmd === 'remove') {
    const [taskRaw] = rest;
    if (taskRaw) {
      const task = safeName(taskRaw);
      const tdir = path.join(dir, '업무');
      if (fs.existsSync(tdir)) for (const f of fs.readdirSync(tdir)) if (f === `${task}.md` || f.startsWith(`${task}-r`)) fs.rmSync(path.join(tdir, f));
    } else fs.rmSync(dir, { recursive: true, force: true });
  } else throw new Error(`모르는 명령: ${cmd}`);
  finish(notes);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main(process.argv.slice(2));
