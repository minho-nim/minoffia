// 옵시디언 노트 보관함 쌓기(v0.5.62, 소유자 2026-11-09 "Graphify·건강 검진·앱 지도·Archify를 옵시디언에"): GitHub Actions가 부른다. AI 없음.
// 보관함 = 비공개 GitHub 저장소(기본 minho-nim/minoffia-notes). 자동으로 만드는 파일만 덮어쓰고 지우며, '내 메모/'는 절대 건드리지 않는다.
// 사용:
//   node scripts/notes-sync.mjs health  <notes> <프로젝트> <health.json> [지도.png] [지도.html]
//   node scripts/notes-sync.mjs archify <notes> <프로젝트> <업무> <버전> <그림.png> [그림.html] [요약.txt]
//   node scripts/notes-sync.mjs graph   <notes> <프로젝트> <graphify obsidian 폴더>
//   node scripts/notes-sync.mjs remove  <notes> <프로젝트> [업무]
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

/** 건강 검진 노트: 최신 결과를 위에, 지난 결과는 '지난 검진'에 날짜별로 쌓는다(최대 20번) */
export function healthNote(project, report, previous = '') {
  const date = String(report.checkedAt ?? '').slice(0, 16).replace('T', ' ');
  const s = report.summary ?? {};
  const line = `- ${date} · 중요 ${s.high ?? 0} · 고칠 만함 ${s.medium ?? 0} · 사소 ${s.low ?? 0}`;
  const old = (previous.split('## 지난 검진')[1] ?? '').split('\n').filter((l) => l.startsWith('- ')).filter((l) => l !== line);
  const issues = (report.issues ?? []).map((i) => `| ${SEV[i.severity] ?? '참고'} | ${String(i.title ?? i.kind).replace(/\|/g, '/')} | ${(i.items ?? []).slice(0, 5).join(', ').replace(/\|/g, '/')} |`);
  return [
    '---', `프로젝트: "${project}"`, 'tags: [minoffia/건강검진]', '---',
    `# ${project} 건강 검진`, '',
    `> [!summary] 최근 검진 ${date}`, `> 중요 **${s.high ?? 0}** · 고칠 만함 **${s.medium ?? 0}** · 사소 **${s.low ?? 0}**${report.files ? ` · 코드 ${report.files}개` : ''}`, '',
    issues.length ? ['| 정도 | 내용 | 파일 |', '|---|---|---|', ...issues].join('\n') : '걱정할 문제가 없어요.', '',
    '## 앱 지도', `![[${project}/앱 지도.png]]`, `[[${project}/앱 지도.html|원본 지도(PC에서 열기)]] · [미노피아에서 크게 보기](${APP_URL})`, '',
    '## 지난 검진', line, ...old.slice(0, 19), '',
  ].join('\n');
}

/** 업무 노트: 결과 버전마다 구조도 그림을 위에서부터 쌓는다 */
export function archifyNote(project, task, revision, image, summary = '', previous = '') {
  const head = `## 결과 v${revision}`;
  const block = [head, summary.trim() ? `> ${summary.trim().slice(0, 600).replace(/\n/g, '\n> ')}` : '', `![[${project}/업무/${image}]]`, `[미노피아에서 크게 보기](${APP_URL})`, ''].filter((x) => x !== '').join('\n');
  const rest = previous.includes('## 결과 v') ? previous.slice(previous.indexOf('## 결과 v')).split(/(?=^## 결과 v)/m).filter((b) => !b.startsWith(`${head}\n`)) : [];
  return ['---', `프로젝트: "${project}"`, 'tags: [minoffia/업무]', '---', `# ${task}`, `[[${project}/건강 검진|${project}]]의 업무`, '', block, '', ...rest].join('\n').replace(/\n{3,}/g, '\n\n');
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
    '# minoffia 노트', '',
    '> [!info] 자동으로 만든 노트예요. 직접 쓰는 메모는 **내 메모** 폴더에 두세요(자동으로 건드리지 않아요).', '',
    '| 프로젝트 | 건강 검진 | 코드 그래프 | 업무 |', '|---|---|---|---|',
    // 표 안의 링크는 | 를 \| 로(옵시디언 표 규칙)
    ...projects.map((p) => `| ${p.name} | ${p.health ? `[[${p.name}/건강 검진\\|보기]]` : '-'} | ${p.graph ? `[[${p.name}/코드 그래프/graph.canvas\\|그래프]]` : '-'} | ${p.tasks} |`),
    '', `[미노피아 열기](${APP_URL})`, '',
  ].join('\n');
}

function scanProjects(notes) {
  return fs.readdirSync(notes, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== MY_NOTES)
    .map((d) => {
      const dir = path.join(notes, d.name);
      const tasks = fs.existsSync(path.join(dir, '업무')) ? fs.readdirSync(path.join(dir, '업무')).filter((f) => f.endsWith('.md')).length : 0;
      return { name: d.name, health: fs.existsSync(path.join(dir, '건강 검진.md')), graph: fs.existsSync(path.join(dir, '코드 그래프')), tasks };
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
      { query: 'path:"코드 그래프"', color: color('5b8def') },
      { query: 'path:"업무"', color: color('e0913a') },
      { query: 'tag:#minoffia/건강검진', color: color('4cb87a') },
      { query: `path:"${MY_NOTES}"`, color: color('b06bd6') },
    ] }, null, 1));
  }
  fs.writeFileSync(path.join(notes, '홈.md'), homeNote(scanProjects(notes)));
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
    const note = path.join(dir, '건강 검진.md');
    fs.writeFileSync(note, healthNote(project, JSON.parse(fs.readFileSync(reportFile, 'utf8')), read(note)));
    copyIf(png, path.join(dir, '앱 지도.png'));
    copyIf(html, path.join(dir, '앱 지도.html'));
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
