/**
 * 빠른 명령(v0.8.5 소유자 "터미널의 빠른 명령은 ㅇㅇ"): 입력창에 '/'를 치면 명령 목록. 규칙만(모델 0).
 * 화면 이동·대화 열기만 한다. 승인·배포처럼 기록이 남는 일은 명령으로 바로 하지 않고 그 화면을 연다(실수 방지).
 */
import type { Project } from './types';

export type CommandId = 'new' | 'chat' | 'work' | 'turn' | 'tasks' | 'projects' | 'agent' | 'skills' | 'usage' | 'settings' | 'search' | 'notes' | 'dash';
export interface Command {
  id: CommandId;
  /** '/' 뒤에 쓰는 말(한국어) */
  word: string;
  /** 같은 뜻의 다른 말 */
  alias: string[];
  desc: string;
  /** 뒤에 붙는 것: 프로젝트 이름 또는 글 */
  arg?: 'project' | 'text';
}

export const COMMANDS: Command[] = [
  { id: 'new', word: '새채팅', alias: ['new', '새대화'], desc: '새 채팅 열기' },
  { id: 'chat', word: '채팅', alias: ['chat'], desc: '그 프로젝트에서 새 대화', arg: 'project' },
  { id: 'work', word: '업무', alias: ['work', '업무대화'], desc: '그 프로젝트 업무 대화 열기', arg: 'project' },
  { id: 'dash', word: '대시보드', alias: ['dash', 'dashboard', '현황'], desc: '한눈에 보기(할 일·진행·사용량)' },
  { id: 'turn', word: '내차례', alias: ['승인', 'turn', 'approve'], desc: '내 차례(승인 기다림) 보기' },
  { id: 'search', word: '검색', alias: ['search', '조사'], desc: '웹에서 찾아 답하기(Tavily·Firecrawl)', arg: 'text' },
  { id: 'notes', word: '노트', alias: ['옵시디언', 'notes'], desc: '옵시디언에 노트 보내기' },
  { id: 'usage', word: '사용량', alias: ['usage', '토큰'], desc: '오늘 사용량·통계' },
  { id: 'tasks', word: '업무탭', alias: ['tasks'], desc: '업무 탭' },
  { id: 'projects', word: '프로젝트', alias: ['projects', '프로젝트탭'], desc: '프로젝트 탭' },
  { id: 'agent', word: '에이전트', alias: ['agent', '에이전트탭'], desc: '에이전트 탭' },
  { id: 'skills', word: '스킬', alias: ['skills', '스킬탭'], desc: '스킬 탭' },
  { id: 'settings', word: '설정', alias: ['settings', '설정탭'], desc: '설정 탭' },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export interface Parsed {
  cmd: Command;
  arg: string;
  /** arg가 프로젝트일 때 찾은 프로젝트 */
  project?: Project;
}

/** '/업무 미노' → 명령 + 나머지. 명령 말이 정확히 맞아야 한다(아니면 null) */
export function parseCommand(input: string, projects: Project[]): Parsed | null {
  const m = /^\/(\S+)\s*([\s\S]*)$/.exec(input.trim());
  if (!m) return null;
  const head = norm(m[1]);
  const cmd = COMMANDS.find((c) => norm(c.word) === head || c.alias.some((a) => norm(a) === head));
  if (!cmd) return null;
  const arg = m[2].trim();
  if (cmd.arg !== 'project') return { cmd, arg };
  const project = arg ? findProject(arg, projects) : undefined;
  return { cmd, arg, ...(project ? { project } : {}) };
}

/** 프로젝트 이름 찾기: 같은 이름 → 앞부분 → 들어 있음(띄어쓰기·대소문자 무시) */
export function findProject(q: string, projects: Project[]): Project | undefined {
  const k = norm(q);
  return projects.find((p) => norm(p.name) === k) ?? projects.find((p) => norm(p.name).startsWith(k)) ?? projects.find((p) => norm(p.name).includes(k));
}

export interface Suggestion {
  text: string;
  label: string;
  desc: string;
  /** 고르면 바로 실행(아니면 입력창에 채우기만) */
  run: boolean;
}

/** '/' 뒤 입력 → 보일 목록(많아야 8개) */
export function suggest(input: string, projects: Project[]): Suggestion[] {
  if (!input.startsWith('/')) return [];
  const [rawHead, ...rest] = input.slice(1).split(/\s+/);
  const head = norm(rawHead ?? '');
  const tail = rest.join(' ').trim();
  const exact = COMMANDS.find((c) => norm(c.word) === head || c.alias.some((a) => norm(a) === head));
  // 명령을 다 쓰고 띄어 쓴 뒤: 프로젝트 고르기
  if (exact && input.slice(1).includes(' ') && exact.arg === 'project') {
    const k = norm(tail);
    return projects
      .filter((p) => !k || norm(p.name).includes(k))
      .slice(0, 8)
      .map((p) => ({ text: `/${exact.word} ${p.name}`, label: `/${exact.word} ${p.name}`, desc: exact.desc, run: true }));
  }
  if (exact && input.slice(1).includes(' ')) return [];
  return COMMANDS.filter((c) => !head || norm(c.word).startsWith(head) || c.alias.some((a) => norm(a).startsWith(head)))
    .slice(0, 8)
    .map((c) => ({ text: `/${c.word}${c.arg ? ' ' : ''}`, label: `/${c.word}${c.arg === 'project' ? ' 프로젝트' : c.arg === 'text' ? ' 질문' : ''}`, desc: c.desc, run: !c.arg }));
}
