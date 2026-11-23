/**
 * 옵시디언 세컨드 브레인(v0.8.5 소유자 "대화 내용이나 프로젝트 업무들 모아서 세컨드 브레인, 옵시디언으로"):
 * 앱이 가진 기록(업무·기획서·결과·승인·수정 요청·확인 질문, 채팅, 위키)을 노트 파일로 만든다. 규칙만(모델 0).
 * 보관함은 minoffia-notes(비공개). '내 메모/'는 만들지도 건드리지도 않는다. 비밀값처럼 생긴 글자는 가린다.
 * 노트끼리는 [[프로젝트]]·[[날짜]]로 이어져 그래프·백링크·Dataview(속성)로 볼 수 있다.
 */
import type { Project, Task } from './types';
import type { WorkflowData } from './workflow-types';
import type { ChatThread, ChatThreadInfo } from '../data/store';
import { maskSecrets } from './maskSecrets';
import { buildOk, testCount } from './approvalSummary';
import { repeatIssues } from './repeatIssues';
import type { ProjectRule } from './types';

export interface NoteFile {
  path: string;
  content: string;
}

const STATUS: Record<string, string> = { queued: '대기', in_progress: '진행', review: '검토', blocked: '막힘', done: '완료' };
const GATE: Record<string, string> = { A: '기획 승인', E: '실행 승인', P: '견본 승인', B: '올리기 승인', C: '배포 승인' };

/** 파일 이름으로 쓸 수 있게(scripts/notes-sync.mjs safeName과 같은 규칙) */
export function safeName(s: string): string {
  const t = String(s ?? '').replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60).trim();
  return t || '이름 없음';
}
const day = (iso: string) => (iso || '').slice(0, 10);
const yaml = (s: string) => JSON.stringify(String(s ?? ''));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const clean = (s: string | undefined | null, n = 4000) => clip(maskSecrets(String(s ?? '').trim()), n);

/** 시험·빌드 한 줄(결과 기록에서 규칙으로) */
function testLine(log: string): string {
  const t = testCount(log ?? '');
  const b = buildOk(log ?? '');
  return `${t ? ` · 시험 ${t.passed}/${t.total}` : ''}${b === null ? '' : b ? ' · 빌드 ✓' : ' · 빌드 실패'}`;
}
/** PM 계획: 조각과 순서 */
function planLines(task: Task, w: WorkflowData): string[] {
  const plan = w.plans.filter((x) => x.taskId === task.id).sort((a, b) => b.planRevision - a.planRevision)[0];
  const items = plan?.plan.work_items ?? [];
  if (!items.length) return [];
  return ['## 계획', ...items.map((it) => `- **${clean(it.title, 100)}**${it.dependencies.length ? ` (먼저: ${it.dependencies.join(', ')})` : ''} — ${clean(it.goal, 200)}`), ''];
}
/** 결과 평가: 점수 · 어긴 것 · 고칠 곳 · 화면 문제 */
function reviewLines(task: Task, w: WorkflowData): string[] {
  const r = (w.reviews ?? []).filter((x) => x.taskId === task.id).sort((a, b) => b.resultRevision - a.resultRevision)[0];
  if (!r) return [];
  const v = r.score?.violations ?? [];
  const f = r.score?.fixes ?? [];
  const sp = r.screen?.problems ?? [];
  return [
    '## 평가',
    `> [!${(r.total ?? 0) >= 80 ? 'success' : 'warning'}] ${r.total ?? '-'}점${r.screen ? ` · 화면 ${r.screen.score}점` : ''}`,
    ...(r.score?.summary ? [`> ${clean(r.score.summary, 300)}`] : []),
    '',
    ...(v.length ? ['**어긴 것**', ...v.map((x) => `- ${clean(x, 200)}`), ''] : []),
    ...(f.length ? ['**고칠 곳**', ...f.map((x) => `- ${clean(x, 200)}`), ''] : []),
    ...(sp.length ? ['**화면에서 고칠 곳**', ...sp.map((x) => `- ${clean(x, 200)}`), ''] : []),
  ];
}
/** 요청에 붙인 링크(읽은 요약) */
function linkLines(task: Task, w: WorkflowData): string[] {
  const links = w.links.filter((l) => l.taskId === task.id && l.status === 'ok');
  if (!links.length) return [];
  return ['## 붙인 링크', ...links.map((l) => `- [${clean(l.title || l.url, 100)}](${l.url})${l.excerpt ? ` — ${clean(l.excerpt, 200)}` : ''}`), ''];
}

export function taskPath(task: Task, project: string): string {
  return `${safeName(project)}/업무/${day(task.createdAt)} ${safeName(task.title)}.md`;
}

/** 업무 노트 한 장: 원문 → 기획서(최신) → 결과(최신) → 결정(승인·수정 요청·확인 질문) */
export function taskNote(task: Task, project: string, w: WorkflowData): string {
  const spec = w.specs.filter((s) => s.taskId === task.id).sort((a, b) => b.revision - a.revision)[0];
  const result = w.results.filter((r) => r.taskId === task.id).sort((a, b) => b.revision - a.revision)[0];
  const approvals = w.approvals.filter((a) => a.taskId === task.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const revisions = w.revisionRequests.filter((r) => r.taskId === task.id);
  const clar = w.clarifications.filter((c) => c.taskId === task.id);
  const doneAt = approvals.filter((a) => a.gate === 'C' && a.decision === 'approved').at(-1)?.createdAt;
  const decisions = [
    ...approvals.map((a) => ({ at: a.createdAt, line: `${GATE[a.gate] ?? a.gate} ${a.decision === 'approved' ? '승인' : '거절'}(v${a.approvedRevision})` })),
    ...revisions.map((r) => ({ at: r.createdAt, line: `수정 요청: ${clean(r.feedback, 400)}` })),
    ...clar.map((c) => ({ at: c.createdAt, line: `확인 질문: ${clean(c.question, 200)} → ${clean(c.answer, 400)}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return [
    '---',
    `프로젝트: ${yaml(`[[${safeName(project)}]]`)}`,
    `상태: ${STATUS[task.status] ?? task.status}`,
    `만든날: ${day(task.createdAt)}`,
    ...(doneAt ? [`끝난날: ${day(doneAt)}`] : []),
    ...(task.prUrl ? [`PR: ${yaml(task.prUrl)}`] : []),
    `담당: ${task.assignee}`,
    'tags: [minoffia/업무]',
    '---',
    `# ${task.title}`,
    '',
    `[[${safeName(project)}]] · [[${day(task.createdAt)}]]${task.prUrl ? ` · [PR](${task.prUrl})` : ''}`,
    '',
    '## 원문',
    clean(task.userOriginalText || task.description) || '(없음)',
    '',
    ...(spec
      ? ['## 기획서', `> 버전 ${spec.revision} · ${spec.planner === 'gemini_draft' ? 'Gemini 초안' : 'ChatGPT'}`, '', clean(spec.finalPrompt || spec.answer, 3000), ...(spec.testCriteria ? ['', '**완료 기준**', clean(spec.testCriteria, 1500)] : []), '']
      : []),
    ...planLines(task, w),
    ...(result ? ['## 결과', `> 결과 ${result.revision}${testLine(result.testLog)}`, '', clean(result.summary, 2000) || '(요약 없음)', ...(result.remainingIssues ? ['', '**남은 문제**', clean(result.remainingIssues, 800)] : []), ''] : []),
    ...reviewLines(task, w),
    ...((task.skills ?? []).length ? ['## 쓴 스킬', (task.skills ?? []).map((k) => `\`${k}\``).join(' · '), ''] : []),
    ...linkLines(task, w),
    ...(decisions.length ? ['## 결정', ...decisions.map((d) => `- ${day(d.at)} ${d.line}`), ''] : []),
  ].join('\n');
}

/** 채팅 노트 자리: 날짜 없이 제목 + 아이디 앞 6자(대화가 이어져도 같은 파일) */
export function chatPath(t: Pick<ChatThread, 'id' | 'title'>, project: string | null): string {
  return `${project ? `${safeName(project)}/채팅` : '채팅'}/${safeName(t.title)} ${t.id.slice(0, 6)}.md`;
}

/** 채팅 노트: 주고받은 말 그대로(비밀값 가림, 답은 길면 자름) */
export function chatNote(t: ChatThread, project: string | null): string {
  const first = t.messages[0]?.at ?? t.updatedAt;
  return [
    '---',
    ...(project ? [`프로젝트: ${yaml(`[[${safeName(project)}]]`)}`] : []),
    `날짜: ${day(first)}`,
    `마지막: ${day(t.updatedAt)}`,
    'tags: [minoffia/채팅]',
    '---',
    `# ${t.title}`,
    '',
    `${project ? `[[${safeName(project)}]] · ` : ''}[[${day(first)}]]`,
    '',
    ...t.messages.flatMap((m) => [m.role === 'user' ? `**나** (${m.at.slice(11, 16)})` : `**${m.by === 'office' ? '미니엉' : `Gemini ${m.by ?? 'A'}`}**`, clean(m.text, 6000), '']),
  ].join('\n');
}

export function wikiNote(project: string, body: string, updatedAt: string): string {
  return ['---', `프로젝트: ${yaml(`[[${safeName(project)}]]`)}`, `고친날: ${day(updatedAt)}`, 'tags: [minoffia/위키]', '---', `# ${project} 위키`, '', `[[${safeName(project)}]]`, '', clean(body, 20000), ''].join('\n');
}

/** 자료 노트 자리: 사이트 이름 + 제목(같은 주소는 같은 파일) */
export function refPath(uri: string, title: string): string {
  let host = '';
  try {
    host = new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    host = '링크';
  }
  return `자료/${safeName(`${host} ${title}`)}.md`;
}

export function refNote(title: string, uri: string, chats: string[], at: string): string {
  return ['---', `주소: ${yaml(uri)}`, `처음 쓴 날: ${day(at)}`, 'tags: [minoffia/자료]', '---', `# ${title}`, '', `[원문 열기](${uri})`, '', '## 쓴 대화', ...chats.map((c) => `- ${c}`), ''].join('\n');
}

/** 데일리 노트(날짜별): 그날 만든·끝난 업무와 채팅으로 가는 링크 */
export function dailyNotes(items: { day: string; line: string }[]): NoteFile[] {
  const by = new Map<string, string[]>();
  for (const it of items) by.set(it.day, [...(by.get(it.day) ?? []), it.line]);
  return [...by.entries()].map(([d, lines]) => ({ path: `데일리/${d}.md`, content: ['---', `날짜: ${d}`, 'tags: [minoffia/데일리]', '---', `# ${d}`, '', ...[...new Set(lines)], ''].join('\n') }));
}

/** 전체 노트 만들기. chats = 새로 받은(바뀐) 대화 전체, chatIndex = 모든 대화 목록(데일리 링크용) */
export function brainNotes(input: { projects: Project[]; tasks: Task[]; workflow: WorkflowData; chats: ChatThread[]; chatIndex: ChatThreadInfo[]; wikis: { projectId: string; body: string; updatedAt: string }[]; rules?: ProjectRule[]; inbox?: InboxLike[]; changelog?: string }): NoteFile[] {
  const name = (id: string | null | undefined) => (id ? input.projects.find((p) => p.id === id)?.name ?? null : null);
  const files: NoteFile[] = [];
  const daily: { day: string; line: string }[] = [];
  for (const t of input.tasks.filter((x) => !x.sample)) {
    const p = name(t.projectId);
    if (!p) continue;
    const path = taskPath(t, p);
    files.push({ path, content: taskNote(t, p, input.workflow) });
    const link = `[[${path.replace(/\.md$/, '')}|${safeName(t.title)}]]`;
    daily.push({ day: day(t.createdAt), line: `- 업무 접수: ${link} (${p})` });
    const done = input.workflow.approvals.filter((a) => a.taskId === t.id && a.gate === 'C' && a.decision === 'approved').at(-1);
    if (done) daily.push({ day: day(done.createdAt), line: `- 업무 배포: ${link} (${p})` });
  }
  for (const c of input.chats.filter((x) => x.messages.length)) {
    files.push({ path: chatPath(c, name(c.projectId)), content: chatNote(c, name(c.projectId)) });
  }
  for (const c of input.chatIndex) {
    const p = name(c.projectId);
    daily.push({ day: day(c.updatedAt), line: `- 채팅: [[${chatPath(c, p).replace(/\.md$/, '')}|${safeName(c.title)}]]${p ? ` (${p})` : ''}` });
  }
  // 자료(v0.8.6 소유자 "웹 조사 출처를 옵시디언 자료/에"): 같은 주소는 한 장, 어느 대화에서 썼는지 링크
  // shortcut: 이번에 바뀐 대화의 출처만 다시 쓴다(옛 대화 링크가 빠질 수 있음), 필요하면 자료 노트를 읽어 합치기
  const refs = new Map<string, { title: string; uri: string; chats: Set<string>; at: string }>();
  for (const c of input.chats) {
    const link = `[[${chatPath(c, name(c.projectId)).replace(/\.md$/, '')}|${safeName(c.title)}]]`;
    for (const m of c.messages) {
      for (const src of m.sources ?? []) {
        if (!/^https?:\/\//.test(src.uri)) continue;
        const r = refs.get(src.uri) ?? { title: src.title, uri: src.uri, chats: new Set<string>(), at: m.at };
        r.chats.add(link);
        refs.set(src.uri, r);
      }
    }
  }
  for (const r of refs.values()) files.push({ path: refPath(r.uri, r.title), content: refNote(r.title, r.uri, [...r.chats], r.at) });
  for (const w of input.wikis) {
    const p = name(w.projectId);
    if (p && w.body.trim()) files.push({ path: `${safeName(p)}/위키.md`, content: wikiNote(p, w.body, w.updatedAt) });
  }
  // v0.8.8: 프로젝트 지식 · 결정 · 업무 대화 · 유튜브 자료 · 아이디어 · 주간 회고
  const used = input.projects.filter((p) => input.tasks.some((t) => t.projectId === p.id && !t.sample));
  for (const p of used) files.push({ path: `${safeName(p.name)}/지식.md`, content: knowledgeNote(p, input.tasks, input.workflow, input.rules ?? []) });
  if (input.changelog) files.push(...decisionNotes(input.changelog));
  const talks = inboxNotes(input.inbox ?? [], name);
  files.push(...talks);
  for (const t of talks) daily.push({ day: t.path.slice(-13, -3), line: `- 업무 대화: [[${t.path.replace(/\.md$/, '')}|${t.path.split('/')[0] === '대화' ? '대화' : t.path.split('/')[0]}]]` });
  const extras = chatExtras(input.chats, name);
  files.push(...extras);
  files.push(...weeklyNotes(input.tasks, input.workflow, name));
  const dailies = dailyNotes(daily);
  const names = [...new Set(input.tasks.filter((t) => !t.sample).map((t) => name(t.projectId)).filter((x): x is string => Boolean(x)))];
  const hubs: NoteFile[] = [
    { path: '대시보드/업무.base', content: TASK_BASE },
    { path: '대시보드/자료.base', content: REF_BASE },
    { path: '대시보드/채팅.base', content: CHAT_BASE },
    { path: '대시보드/아이디어.base', content: IDEA_BASE },
    {
      path: '대시보드/한눈에.md',
      content: homeHub(
        names,
        dailies.map((d) => d.path.slice(4, -3)).sort().reverse(),
        files.filter((f) => f.path.startsWith('주간/')).map((f) => f.path.slice(3, -3)).sort().reverse(),
        files.filter((f) => f.path.startsWith('결정/')).map((f) => f.path.slice(3, -3)).sort().reverse(),
      ),
    },
    ...names.map((p) => ({ path: `${safeName(p)}/업무 목록.md`, content: projectHub(p) })),
  ];
  return [...files, ...dailies, ...hubs];
}


// ── 더 넣기(v0.8.8 소유자 "옵시디언은 다 넣고 복잡해져도 됨, 꺼내 쓰고 보기 좋게") ──

/** 프로젝트 지식: 지켜야 할 것 · 반복되는 문제 · 결정 모음(수정 요청·확인 답·거절) */
export function knowledgeNote(project: Project, tasks: Task[], w: WorkflowData, rules: ProjectRule[]): string {
  const name = safeName(project.name);
  const mine = tasks.filter((t) => t.projectId === project.id);
  const ids = new Set(mine.map((t) => t.id));
  const link = (taskId: string | null) => {
    const t = taskId ? mine.find((x) => x.id === taskId) : null;
    return t ? ` · [[${taskPath(t, project.name).replace(/\.md$/, '')}|${safeName(t.title)}]]` : '';
  };
  const myRules = rules.filter((r) => r.projectId === project.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const repeats = repeatIssues(w.reviews ?? [], mine, project.id, myRules.map((r) => r.rule));
  const decisions = [
    ...w.revisionRequests.filter((r) => ids.has(r.taskId)).map((r) => ({ at: r.createdAt, line: `수정 요청: ${clean(r.feedback, 300)}${link(r.taskId)}` })),
    ...w.clarifications.filter((c) => ids.has(c.taskId)).map((c) => ({ at: c.createdAt, line: `${clean(c.question, 150)} → **${clean(c.answer, 300)}**${link(c.taskId)}` })),
    ...w.approvals.filter((a) => ids.has(a.taskId) && a.decision === 'rejected').map((a) => ({ at: a.createdAt, line: `${GATE[a.gate] ?? a.gate} 거절${link(a.taskId)}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return [
    '---', `프로젝트: ${yaml(`[[${name}]]`)}`, 'tags: [minoffia/지식]', '---',
    `# ${project.name} 지식`, '', `[[${name}]] · [[${name}/업무 목록|업무 목록]] · [[${name}/위키|위키]] · [[대시보드/한눈에|한눈에]]`, '',
    '> [!important] 지켜야 할 것', ...(myRules.length ? myRules.map((r) => `> - ${clean(r.rule, 300)} _(${RULE_SRC[r.source] ?? r.source} · ${day(r.createdAt)})_${link(r.taskId)}`) : ['> 아직 없어요.']), '',
    '> [!warning] 반복되는 문제', ...(repeats.length ? repeats.map((r) => `> - ${clean(r.text, 200)} — ${r.count}번`) : ['> 아직 없어요.']), '',
    '## 결정 모음', ...(decisions.length ? decisions.slice(0, 80).map((d) => `- ${day(d.at)} ${d.line}`) : ['아직 없어요.']), '',
  ].join('\n');
}
const RULE_SRC: Record<string, string> = { spec: '기획서', plan: 'PM 계획', result: '개발 결과', owner: '내가 적음' };

/** 변경 기록(CHANGELOG)에서 소유자 결정("소유자 …" 따옴표)만 달마다 한 장 */
export function decisionNotes(changelog: string): NoteFile[] {
  const months = new Map<string, string[]>();
  let head = '';
  let date = '';
  for (const line of changelog.split('\n')) {
    const h = /^##\s+(.+?)(?:\s+—\s+(\d{4}-\d{2}-\d{2}))?\s*$/.exec(line);
    if (h) {
      head = h[1].trim();
      date = h[2] ?? date;
      continue;
    }
    if (!date || !/소유자/.test(line)) continue;
    const quotes = [...line.matchAll(/소유자[^"“]{0,20}["“]([^"”]{4,160})["”]/g)].map((m) => m[1]);
    if (!quotes.length) continue;
    const ver = /\(v(\d+\.\d+\.\d+)\)/.exec(head)?.[1] ?? '';
    const key = date.slice(0, 7);
    const list = months.get(key) ?? [];
    for (const q of quotes) list.push(`- ${date}${ver ? ` · v${ver}` : ''} — "${clean(q, 160)}" _(${clean(head.replace(/\(v[\d.]+\)/, ''), 60)})_`);
    months.set(key, list);
  }
  return [...months.entries()].map(([m, lines]) => ({
    path: `결정/${m}.md`,
    content: ['---', `달: ${m}`, 'tags: [minoffia/결정]', '---', `# ${m} 내 결정`, '', '> [!quote] 미노피아 변경 기록에 남은 소유자 말(무엇을 왜 하기로 했는지)', '', ...[...new Set(lines)], ''].join('\n'),
  }));
}

export interface InboxLike {
  id?: string;
  from?: string;
  text?: string;
  home?: string;
  at?: string;
}
const msgAt = (m: InboxLike) => m.at ?? (/^(\d{13})-/.exec(m.id ?? '') ? new Date(Number(m.id!.slice(0, 13))).toISOString() : null);

/** 업무 대화(질문과 답만, 알림 빼고) → 프로젝트·날짜마다 한 장 */
export function inboxNotes(msgs: InboxLike[], name: (id: string | null) => string | null): NoteFile[] {
  const groups = new Map<string, { project: string | null; day: string; lines: string[] }>();
  for (const m of msgs) {
    if ((m.from !== 'me' && m.from !== 'gemini') || !m.text?.trim()) continue;
    const at = msgAt(m);
    if (!at) continue;
    const project = m.home ? name(m.home) : null;
    const d = day(at);
    const key = `${project ?? ''}|${d}`;
    const g = groups.get(key) ?? { project, day: d, lines: [] };
    g.lines.push(m.from === 'me' ? `**나** (${at.slice(11, 16)})` : '**Gemini**', clean(m.text, 4000), '');
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    path: `${g.project ? `${safeName(g.project)}/대화` : '대화'}/${g.day}.md`,
    content: ['---', ...(g.project ? [`프로젝트: ${yaml(`[[${safeName(g.project)}]]`)}`] : []), `날짜: ${g.day}`, 'tags: [minoffia/업무대화]', '---', `# ${g.project ? `${g.project} ` : ''}업무 대화 ${g.day}`, '', `${g.project ? `[[${safeName(g.project)}]] · ` : ''}[[데일리/${g.day}|${g.day}]]`, '', ...g.lines].join('\n'),
  }));
}

const YT = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s#]*?&)?v=|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
/** 채팅의 유튜브 요약 → 자료(영상마다 한 장), '아이디어:'로 쓴 말 → 아이디어 */
export function chatExtras(chats: ChatThread[], name: (id: string | null) => string | null): NoteFile[] {
  const out: NoteFile[] = [];
  for (const c of chats) {
    const link = `[[${chatPath(c, name(c.projectId ?? null)).replace(/\.md$/, '')}|${safeName(c.title)}]]`;
    c.messages.forEach((m, i) => {
      if (m.role !== 'user') return;
      const v = YT.exec(m.text);
      const ans = c.messages[i + 1];
      if (v && ans && ans.role === 'model' && ans.by !== 'office') {
        const first = ans.text.split('\n').map((l) => l.replace(/[#*>\-\s]+/g, ' ').trim()).find((l) => l.length >= 2) ?? '영상';
        out.push({
          path: `자료/유튜브 ${safeName(first).slice(0, 40)} ${v[1]}.md`,
          content: ['---', `주소: ${yaml(`https://www.youtube.com/watch?v=${v[1]}`)}`, `처음 쓴 날: ${day(m.at)}`, 'tags: [minoffia/자료, minoffia/유튜브]', '---', `# ${clean(first, 80)}`, '', `[영상 보기](https://www.youtube.com/watch?v=${v[1]}) · ${link}`, '', '## 요약', clean(ans.text, 8000), ''].join('\n'),
        });
      }
      const idea = /^\s*(?:아이디어|idea)\s*[:：]\s*([\s\S]+)/i.exec(m.text);
      if (idea) {
        const title = safeName(idea[1].split('\n')[0]).slice(0, 40);
        out.push({ path: `아이디어/${day(m.at)} ${title}.md`, content: ['---', `날짜: ${day(m.at)}`, 'tags: [minoffia/아이디어]', '---', `# ${clean(idea[1].split('\n')[0], 80)}`, '', clean(idea[1], 4000), '', `나온 곳: ${link}`, ''].join('\n') });
      }
    });
  }
  return out;
}

/** ISO 주(월요일 시작) 이름: 2026-W48 */
export function isoWeek(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/** 주간 회고: 접수·배포·실패·반복 문제·데일리 링크(규칙) */
export function weeklyNotes(tasks: Task[], w: WorkflowData, name: (id: string | null) => string | null): NoteFile[] {
  const weeks = new Map<string, { created: string[]; deployed: string[]; failed: string[]; days: Set<string> }>();
  const get = (k: string) => {
    const v = weeks.get(k) ?? { created: [], deployed: [], failed: [], days: new Set<string>() };
    weeks.set(k, v);
    return v;
  };
  const tl = (t: Task) => `[[${taskPath(t, name(t.projectId) ?? '').replace(/\.md$/, '')}|${safeName(t.title)}]] (${name(t.projectId) ?? ''})`;
  for (const t of tasks) {
    if (t.sample || !name(t.projectId)) continue;
    const g = get(isoWeek(t.createdAt));
    g.created.push(tl(t));
    g.days.add(day(t.createdAt));
    if (t.status === 'blocked') g.failed.push(tl(t));
  }
  for (const a of w.approvals.filter((x) => x.gate === 'C' && x.decision === 'approved')) {
    const t = tasks.find((x) => x.id === a.taskId);
    if (!t || t.sample || !name(t.projectId)) continue;
    const g = get(isoWeek(a.createdAt));
    g.deployed.push(tl(t));
    g.days.add(day(a.createdAt));
  }
  return [...weeks.entries()].map(([k, g]) => ({
    path: `주간/${k}.md`,
    content: [
      '---', `주: ${k}`, `접수: ${g.created.length}`, `배포: ${g.deployed.length}`, 'tags: [minoffia/주간]', '---',
      `# ${k} 주간 회고`, '',
      `> [!summary] 접수 **${g.created.length}** · 배포 **${g.deployed.length}**${g.failed.length ? ` · 막힘 **${g.failed.length}**` : ''}`, '',
      '## 배포', ...(g.deployed.length ? [...new Set(g.deployed)].map((x) => `- ${x}`) : ['없음']), '',
      '## 접수', ...(g.created.length ? g.created.map((x) => `- ${x}`) : ['없음']), '',
      ...(g.failed.length ? ['## 막힌 것', ...g.failed.map((x) => `- ${x}`), ''] : []),
      '## 날마다', ...[...g.days].sort().map((d) => `- [[데일리/${d}|${d}]]`), '',
      // 자동 노트는 다시 덮어써지므로, 내 회고는 '내 메모'에 따로(누르면 그 자리에 새 노트가 생김)
      `> [!note] 내 회고는 [[내 메모/주간 회고/${k}|여기에 쓰기]] (자동 노트는 다시 채워져요)`, '',
    ].join('\n'),
  }));
}

// ── 허브(v0.8.7 소유자 "옵시디언 고도화"): 옵시디언 기본 기능 Bases(.base, 플러그인 설치 없음)로 업무·자료·채팅을 표로 본다 ──
// shortcut: 한글 속성 이름을 note["…"]로 읽는다. 옵시디언에서 표가 비면 속성 이름 표기를 바꿔 확인.
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** 업무 표: 열린 업무 · 이번 달 끝난 업무 · 전체 */
export const TASK_BASE = [
  'filters:',
  '  and:',
  '    - file.hasTag("minoffia/업무")',
  'properties:',
  '  file.name:',
  '    displayName: 업무',
  'views:',
  '  - type: table',
  '    name: 열린 업무',
  '    filters:',
  "      and:",
  `        - 'note["상태"] != "완료"'`,
  '    order:',
  '      - file.name',
  '      - note.프로젝트',
  '      - note.상태',
  '      - note.만든날',
  '  - type: table',
  '    name: 끝난 업무',
  '    filters:',
  "      and:",
  `        - 'note["상태"] == "완료"'`,
  '    order:',
  '      - file.name',
  '      - note.프로젝트',
  '      - note.끝난날',
  '      - note.PR',
  '  - type: table',
  '    name: 전체',
  '    order:',
  '      - file.name',
  '      - note.프로젝트',
  '      - note.상태',
  '      - note.만든날',
  '',
].join('\n');

/** 자료 표·채팅 표 */
export const REF_BASE = ['filters:', '  and:', '    - file.hasTag("minoffia/자료")', 'views:', '  - type: table', '    name: 자료', '    order:', '      - file.name', '      - note.주소', '      - note.처음 쓴 날', ''].join('\n');
export const CHAT_BASE = ['filters:', '  and:', '    - file.hasTag("minoffia/채팅")', 'views:', '  - type: table', '    name: 채팅', '    order:', '      - file.name', '      - note.프로젝트', '      - note.마지막', ''].join('\n');

/** 프로젝트마다 업무 목록(그 폴더 업무만 표로) */
export function projectHub(project: string): string {
  const dir = `${safeName(project)}/업무`;
  return [
    '---', `프로젝트: ${yaml(`[[${safeName(project)}]]`)}`, 'tags: [minoffia/허브]', '---',
    `# ${project} 업무 목록`, '', `[[${safeName(project)}]] · [[${safeName(project)}/지식|지식]] · [[${safeName(project)}/위키|위키]] · [[대시보드/한눈에|한눈에]]`, '',
    '```base',
    'filters:', '  and:', `    - file.inFolder("${q(dir)}")`,
    'views:', '  - type: table', '    name: 업무', '    order:', '      - file.name', '      - note.상태', '      - note.만든날', '      - note.끝난날',
    '```', '',
  ].join('\n');
}

/** 한눈에(허브): 표 3개 + 프로젝트 목록 + 최근 데일리 */
export function homeHub(projects: string[], days: string[], weeks: string[] = [], months: string[] = []): string {
  return [
    '---', 'tags: [minoffia/허브]', '---',
    '# 미노피아 한눈에', '',
    '> [!tip] 미노피아가 하루 한 번 채워요. 직접 쓰는 메모는 **내 메모** 폴더에(자동으로 건드리지 않아요).', '',
    '## 지금', '![[대시보드/업무.base]]', '',
    '## 프로젝트', '| 프로젝트 | 업무 | 지식 | 위키 |', '|---|---|---|---|',
    ...projects.map((p) => `| ${p} | [[${safeName(p)}/업무 목록\\|업무]] | [[${safeName(p)}/지식\\|지식]] | [[${safeName(p)}/위키\\|위키]] |`), '',
    '## 돌아보기', ...weeks.slice(0, 4).map((w) => `- [[주간/${w}|${w} 주간 회고]]`), ...days.slice(0, 7).map((d) => `- [[데일리/${d}|${d}]]`), '',
    '## 내 결정', ...(months.length ? months.map((m) => `- [[결정/${m}|${m}]]`) : ['아직 없어요.']), '',
    '## 아이디어', '![[대시보드/아이디어.base]]', '',
    '## 채팅', '![[대시보드/채팅.base]]', '',
    '## 자료(웹·유튜브)', '![[대시보드/자료.base]]', '',
  ].join('\n');
}

export const IDEA_BASE = ['filters:', '  and:', '    - file.hasTag("minoffia/아이디어")', 'views:', '  - type: cards', '    name: 아이디어', '    order:', '      - file.name', '      - note.날짜', ''].join('\n');

/** 바뀐 노트만 보내려고 쓰는 짧은 지문 */
export function noteHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
