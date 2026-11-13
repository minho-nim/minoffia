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
    `![[${project}/앱 지도.png]]`, '',
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
    ...projects.map((p) => `- ${p.note ? `[[${p.name}]]` : p.name}${p.map ? ` · [[${p.name}/앱 지도|앱 지도]]` : ' · 아직 지도 없음'}`),
    '', `[미노피아 열기](${APP_URL})`, '',
  ].join('\n');
}

/** 앱 지도 말고 예전에 자동으로 만든 것(점검·업무 구조도·코드 그래프·원본 지도)을 지운다(v0.5.94). 내 메모는 건드리지 않는다 */
export const OLD_AUTO = ['점검.md', '업무', '코드 그래프', '앱 지도.html'];

function scanProjects(notes) {
  return fs.readdirSync(notes, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== MY_NOTES && !SHARED.includes(d.name))
    .map((d) => {
      const dir = path.join(notes, d.name);
      for (const old of OLD_AUTO) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
      return { name: d.name, map: fs.existsSync(path.join(dir, '앱 지도.md')), note: fs.existsSync(path.join(dir, `${d.name}.md`)) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
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
  fs.writeFileSync(path.join(notes, '홈.md'), homeNote(scanProjects(notes)));
}

// ── 버전 노트(v0.6.89, 소유자 "버전마다 쓴 스킬·만든 AI로 이어지게, 너무 복잡하지 않게") ──
// 선은 버전 → 스킬, 버전 → AI, 버전 → '<프로젝트> 버전' 묶음만. '쓴 스킬'·'개발' 묶음은 숫자 목록(링크 없음)이라 선을 늘리지 않는다.
// 스킬·AI 노트는 모든 프로젝트가 같이 쓰는 공용 폴더 하나씩.
export const SHARED = ['스킬', 'AI'];
const ENTRY_MARK = /<!-- minoffia:entries (.*?) -->/s;
const SKILL_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const AGENTS = ['Codex', 'Claude', 'Gemini', '직접'];

/** 버전 이름: package.json 버전이 있으면 v1.2.3, 없으면 날짜(2026.11.13) */
export function versionName(entry) {
  if (/^\d+\.\d+\.\d+[\w.-]*$/.test(entry.version ?? '')) return `v${entry.version}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') ? entry.date.replaceAll('-', '.') : '날짜 없음';
}
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
/** 같은 업무(제목)는 새 것으로 바꾸고, 아니면 더한다 */
export function addEntry(list, entry) {
  const e = {
    task: safeName(entry.task || '업무'),
    date: /^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') ? entry.date : '',
    score: /^\d{1,3}$/.test(String(entry.score ?? '')) ? Number(entry.score) : null,
    pr: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(entry.pr ?? '') ? entry.pr : '',
    agent: AGENTS.includes(entry.agent) ? entry.agent : '직접',
    skills: [...new Set((entry.skills ?? []).filter((n) => SKILL_RE.test(n)))].slice(0, 12),
  };
  return [...list.filter((x) => x.task !== e.task), e];
}
export function versionNote(project, name, list) {
  const body = list.flatMap((e) => [
    `## ${e.task}`,
    `- ${[e.date, e.score != null ? `점수 ${e.score}` : '', e.pr ? `[PR #${e.pr.split('/').pop()}](${e.pr})` : ''].filter(Boolean).join(' · ') || '기록 없음'}`,
    `- 만든 AI: [[${e.agent}]]`,
    `- 쓴 스킬: ${e.skills.length ? e.skills.map((n) => `[[${n}]]`).join(' ') : '없음'}`,
    '',
  ]);
  return [
    '---', 'tags: [minoffia/버전]', `프로젝트: "[[${project}]]"`, `버전: ${name}`, '---',
    `# ${project} ${name}`, '', ...body,
    `← [[${project} 버전]]`, '',
    `<!-- minoffia:entries ${JSON.stringify(list)} -->`, '',
  ].join('\n');
}
/** 큰 단위(v0.6, 2026.11)로 묶어 최신부터 */
const group = (n) => n.split('.').slice(0, 2).join('.');
const cmp = (a, b) => b.localeCompare(a, undefined, { numeric: true });
export function hubNotes(project, versions, installed = []) {
  const names = Object.keys(versions).sort(cmp);
  const groups = [...new Set(names.map(group))];
  const all = Object.values(versions).flat();
  const count = (key) => {
    const m = new Map();
    for (const e of all) for (const k of key(e)) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const table = (rows, head) => (rows.length ? [`| ${head} | 업무 수 |`, '|---|---|', ...rows.map(([k, n]) => `| ${k} | ${n} |`)] : ['아직 없어요.']);
  return {
    [`${project}.md`]: ['---', 'tags: [minoffia/프로젝트]', '---', `# ${project}`, '', `- [[${project} 버전]] · 버전 ${names.length}개`, `- [[${project} 쓴 스킬]]`, `- [[${project} 개발]]`, `- [[${project}/앱 지도|앱 지도]]`, '', `[미노피아 열기](${APP_URL})`, ''].join('\n'),
    [`${project} 버전.md`]: ['---', 'tags: [minoffia/묶음]', '---', `# ${project} 버전`, '', '> [!info] 배포할 때마다 자동으로 더해져요. 제목(▸)을 눌러 지난 묶음을 접을 수 있어요.', '', ...groups.flatMap((g) => [`## ${g}`, ...names.filter((n) => group(n) === g).map((n) => `- [[${project} ${n}|${n}]] · 업무 ${versions[n].length}개`), '']), `← [[${project}]]`, ''].join('\n'),
    [`${project} 쓴 스킬.md`]: ['---', 'tags: [minoffia/묶음]', '---', `# ${project} 쓴 스킬`, '', '> [!info] 그래프가 복잡하지 않게 링크 없이 숫자만 적어요. 스킬 노트의 백링크에서 쓴 버전을 볼 수 있어요.', '', ...table(count((e) => e.skills), '스킬'), '', '## 저장소에 들어 있는 스킬', installed.length ? installed.join(', ') : '없음', '', `← [[${project}]]`, '', `<!-- minoffia:installed ${JSON.stringify(installed)} -->`, ''].join('\n'),
    [`${project} 개발.md`]: ['---', 'tags: [minoffia/묶음]', '---', `# ${project} 개발`, '', ...table(count((e) => [e.agent]), '만든 AI'), '', `← [[${project}]]`, ''].join('\n'),
  };
}
export const skillStub = (n) => `---\ntags: [minoffia/스킬]\n---\n# ${n}\n\n스킬(공용 노트). 이 스킬을 쓴 버전은 아래 백링크에 모여요.\n`;
export const aiStub = (n) => `---\ntags: [minoffia/AI]\n---\n# ${n}\n\n개발 AI(공용 노트). 이 AI가 만든 버전은 아래 백링크에 모여요.\n`;

const INSTALLED_MARK = /<!-- minoffia:installed (.*?) -->/;
function writeHubs(dir, project, vdir, installed) {
  let keep = installed;
  if (!keep) {
    try { keep = JSON.parse((read(path.join(dir, `${project} 쓴 스킬.md`)).match(INSTALLED_MARK) ?? [])[1] ?? '[]'); } catch { keep = []; }
  }
  // 파일 이름은 '<프로젝트> <버전>.md'(다른 프로젝트의 같은 버전과 링크가 섞이지 않게). 예전 'v0.6.89.md'는 이름을 바꾼다
  const pre = `${project} `;
  if (fs.existsSync(vdir)) for (const f of fs.readdirSync(vdir)) if (f.endsWith('.md') && !f.startsWith(pre)) fs.renameSync(path.join(vdir, f), path.join(vdir, pre + f));
  const versions = fs.existsSync(vdir) ? Object.fromEntries(fs.readdirSync(vdir).filter((f) => f.endsWith('.md')).map((f) => [f.slice(pre.length, -3), readEntries(read(path.join(vdir, f)))])) : {};
  for (const [f, text] of Object.entries(hubNotes(project, versions, (keep ?? []).filter((n) => SKILL_RE.test(n))))) fs.writeFileSync(path.join(dir, f), text);
}
const AI_DESC = {
  Codex: '주 개발. Linear로 업무를 받아 Codex 클라우드에서 개발하고, 결과를 미노피아로 보낸다.',
  Claude: 'PM과 보조 개발. 요청을 기획서로 나누고, 루틴으로 받아 개발하거나 올리기 승인 뒤 PR을 연다.',
  Gemini: '결과 채점(기본)과 분배 보조. 무료 키만 쓴다.',
  직접: '앱 업무를 거치지 않고 소유자나 AI 세션이 저장소를 직접 바꾼 것.',
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
function writeBackfill(notes, data) {
  for (const p of data.projects ?? []) {
    const project = safeName(p.name);
    const dir = path.join(notes, project);
    const vdir = path.join(dir, '버전');
    fs.mkdirSync(vdir, { recursive: true });
    // 다시 채울 때: 이번 목록에 없고 PR도 없는(지난 채우기가 만든) 버전 노트는 지운다. 배포 때 만든 것(PR 있음)은 남긴다
    const want = new Set((p.versions ?? []).map((v) => `${project} ${versionName(v)}.md`));
    for (const f of fs.existsSync(vdir) ? fs.readdirSync(vdir) : []) {
      const list = readEntries(read(path.join(vdir, f)));
      if (f.endsWith('.md') && f.startsWith(`${project} `) && !want.has(f) && list.length && list.every((e) => !e.pr)) fs.rmSync(path.join(vdir, f));
    }
    for (const v of p.versions ?? []) {
      const name = versionName(v);
      const file = path.join(vdir, `${project} ${name}.md`);
      const had = readEntries(read(file));
      if (had.length) continue;
      fs.writeFileSync(file, versionNote(project, name, addEntry([], v)));
    }
    writeHubs(dir, project, vdir, p.skills ?? []);
  }
  const SKILLS = path.join(notes, '스킬');
  fs.mkdirSync(SKILLS, { recursive: true });
  for (const s of data.skills ?? []) {
    if (!SKILL_RE.test(s.name)) continue;
    const users = (data.projects ?? []).filter((p) => (p.skills ?? []).includes(s.name)).map((p) => safeName(p.name));
    fs.writeFileSync(path.join(SKILLS, `${s.name}.md`), skillNote(s, users));
  }
  fs.mkdirSync(path.join(notes, 'AI'), { recursive: true });
  for (const n of AGENTS) fs.writeFileSync(path.join(notes, 'AI', `${n}.md`), aiNote(n));
}

function writeVersion(notes, project, entry) {
  const dir = path.join(notes, project);
  const vdir = path.join(dir, '버전');
  fs.mkdirSync(vdir, { recursive: true });
  const name = versionName(entry);
  const old = path.join(vdir, `${name}.md`);
  const file = path.join(vdir, `${project} ${name}.md`);
  if (fs.existsSync(old) && !fs.existsSync(file)) fs.renameSync(old, file);
  const list = addEntry(readEntries(read(file)), entry);
  fs.writeFileSync(file, versionNote(project, name, list));
  writeHubs(dir, project, vdir);
  const last = list[list.length - 1];
  for (const n of last.skills) {
    const f = path.join(notes, '스킬', `${n}.md`);
    if (!fs.existsSync(f)) (fs.mkdirSync(path.dirname(f), { recursive: true }), fs.writeFileSync(f, skillStub(n)));
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
    fs.writeFileSync(path.join(dir, '앱 지도.md'), appMapNote(project, JSON.parse(fs.readFileSync(reportFile, 'utf8'))));
    copyIf(png, path.join(dir, '앱 지도.png'));
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
