// 대화창의 AI 먼저 판단(v0.4.29, 소유자 2026-11-01 "AI가 자체 판단을 먼저").
// 보낸 말을 Gemini가 한 번에 판단하고(질문·업무·애매 + 어느 프로젝트) 질문이면 이어서 바로 답한다.
// Gemini 답의 첫 줄이 판단 머리(@@질문 / @@업무 <프로젝트 이름|없음> / @@애매)이고 둘째 줄부터가 본문이다.
// 서버(supabase/functions/ask-gemini)의 ROUTE 안내문과 형식이 같아야 한다.
import type { Project, Task } from './types';

export type RouteKind = 'question' | 'task' | 'ambiguous';

/** 질문과 함께 Gemini에 보내는 것: 판단에 쓸 프로젝트 이름들, 고른 프로젝트의 정보 */
export interface AskOptions {
  route?: { projects: string[] };
  project?: { name: string; description: string; repo: string | null; openTasks: string[] };
}

export interface Routed {
  /** 머리 줄을 다 받았는지(스트리밍 중에는 첫 줄이 끝날 때까지 본문을 보여 주지 않는다) */
  ready: boolean;
  kind: RouteKind;
  /** AI가 고른 프로젝트 이름(업무일 때, 없으면 null) */
  project: string | null;
  /** 머리를 뺀 본문(질문이면 답, 업무면 요청 정리, 애매면 확인 질문) */
  body: string;
}

const HEAD = /^\s*@@\s*(질문|업무|애매)[ \t]*(.*)$/;

/** 받은 글(스트리밍 중간이어도 됨)에서 판단 머리와 본문을 나눈다. 머리가 없으면 질문 답으로 본다. */
export function parseRouted(text: string): Routed {
  const trimmed = text.replace(/^\s+/, '');
  if (!trimmed.startsWith('@@')) {
    // '@'만 온 상태는 머리일 수 있으니 기다린다.
    if (trimmed === '' || trimmed === '@') return { ready: false, kind: 'question', project: null, body: '' };
    return { ready: true, kind: 'question', project: null, body: text.trim() };
  }
  const nl = trimmed.indexOf('\n');
  if (nl < 0) return { ready: false, kind: 'question', project: null, body: '' };
  const m = HEAD.exec(trimmed.slice(0, nl));
  const body = trimmed.slice(nl + 1).trim();
  if (!m) return { ready: true, kind: 'question', project: null, body };
  const kind: RouteKind = m[1] === '업무' ? 'task' : m[1] === '애매' ? 'ambiguous' : 'question';
  const name = m[2].trim().replace(/^['"“‘[(]+|['"”’\])]+$/g, '');
  return { ready: true, kind, project: kind === 'task' && name && name !== '없음' ? name : null, body };
}

/** AI가 말한 프로젝트 이름을 실제 프로젝트에 맞춘다(대소문자·공백 무시, 정확히 하나일 때만) */
export function matchRoutedProject(name: string | null, projects: Project[]): Project | null {
  if (!name) return null;
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const exact = projects.filter((p) => key(p.name) === key(name));
  if (exact.length === 1) return exact[0];
  const partial = projects.filter((p) => key(p.name).includes(key(name)) || key(name).includes(key(p.name)));
  return partial.length === 1 ? partial[0] : null;
}

/** 고른 프로젝트의 정보(이름·설명·저장소·열린 업무 제목 10개까지)를 Gemini에 보낼 모양으로 */
export function projectContext(project: Project, tasks: Task[]): NonNullable<AskOptions['project']> {
  return {
    name: project.name,
    description: project.description.slice(0, 500),
    repo: project.repo,
    openTasks: tasks
      .filter((t) => t.projectId === project.id && t.status !== 'done')
      .slice(0, 10)
      .map((t) => t.title.slice(0, 80)),
  };
}
