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
    ...(result ? ['## 결과', `> 결과 ${result.revision}`, '', clean(result.summary, 2000) || '(요약 없음)', ...(result.remainingIssues ? ['', '**남은 문제**', clean(result.remainingIssues, 800)] : []), ''] : []),
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
export function brainNotes(input: { projects: Project[]; tasks: Task[]; workflow: WorkflowData; chats: ChatThread[]; chatIndex: ChatThreadInfo[]; wikis: { projectId: string; body: string; updatedAt: string }[] }): NoteFile[] {
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
  return [...files, ...dailyNotes(daily)];
}

/** 바뀐 노트만 보내려고 쓰는 짧은 지문 */
export function noteHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
