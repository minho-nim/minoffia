/**
 * 사용량 한 계산(v0.7.84 소유자 "같은 기준의 사용량, 무슨 일 했는지, 일간·주간·월간, 통계 보기").
 * 설정 탭 사용량·에이전트 탭 칩·통계 보기가 모두 이 파일만 쓴다(숫자가 서로 어긋나지 않게).
 * - 횟수: 앱이 직접 남긴 기록(ai_calls·usage_runs)
 * - 토큰: Studio(Gemini)는 Google이 알려 준 값, Claude는 세션이 결과 요약에 적은 "쓴 토큰: n"(Claude Code 세션 기록),
 *   없으면(Codex 포함) 지시서·결과 글자 수로 추정. Tavily·Firecrawl은 토큰이 아니라 크레딧.
 */
import { kstDay } from './usage';
import { searchCreditsOf } from './searchCredits';

export type UsageAgentId = 'claude' | 'codex' | 'studioA' | 'studioB' | 'search' | 'firecrawl';
export const USAGE_AGENTS: { id: UsageAgentId; name: string; unit: 'token' | 'credit' }[] = [
  { id: 'claude', name: 'Claude', unit: 'token' },
  { id: 'codex', name: 'Codex', unit: 'token' },
  { id: 'studioA', name: 'Studio A', unit: 'token' },
  { id: 'studioB', name: 'Studio B', unit: 'token' },
  { id: 'search', name: 'Tavily', unit: 'credit' },
  { id: 'firecrawl', name: 'Firecrawl', unit: 'credit' },
];

/** ai_calls 한 줄(모든 공급자) */
export interface UsageCall {
  provider: string;
  keySlot: 1 | 2 | null;
  purpose: string;
  model: string;
  ok: boolean;
  tokens: number | null;
  createdAt: string;
}
/** usage_runs 한 줄(Claude·Codex 업무 전달·시작) */
export interface UsageRunRow {
  agent: string;
  taskId: string | null;
  createdAt: string;
}
export interface UsageResult {
  taskId: string;
  source: string;
  summary: string;
  diff: string;
  testLog: string;
  createdAt: string;
}
export interface UsageInput {
  calls: UsageCall[];
  runs: UsageRunRow[];
  results: UsageResult[];
  tasks: { id: string; title: string; projectId: string }[];
  projects: { id: string; name: string }[];
  /** 업무별 지시서(최신 기획서 final_prompt) 글자 수: Codex·Claude 추정에 쓴다 */
  promptChars?: Record<string, number>;
}

export type Period = 'day' | 'week' | 'month';
export interface Range {
  /** KST 날짜(YYYY-MM-DD), 둘 다 포함 */
  from: string;
  to: string;
  label: string;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const wd = (day: string) => WD[new Date(`${day}T00:00:00Z`).getUTCDay()];
const md = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;

/** 기간 범위. offset: 0 = 이번(오늘·이번 주·이번 달), -1 = 지난 … */
export function rangeOf(period: Period, now: Date = new Date(), offset = 0): Range {
  const today = kstDay(now);
  if (period === 'day') {
    const d = addDays(today, offset);
    return { from: d, to: d, label: `${md(d)}(${wd(d)})` };
  }
  if (period === 'week') {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 월 = 0
    const from = addDays(today, -dow + offset * 7);
    const to = addDays(from, 6);
    return { from, to, label: `${md(from)}(월) ~ ${md(to)}(일)` };
  }
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 + offset;
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10), label: `${first.getUTCFullYear()}년 ${first.getUTCMonth() + 1}월` };
}

/** 캘린더로 고른 기간(v0.7.85 소유자 "검색 기간을 캘린더로"): 끝일은 오늘까지, 시작 > 끝이면 바꾸고, 최대 366일 */
export const MAX_CUSTOM_DAYS = 366;
export function customRange(from: string, to: string, now: Date = new Date()): Range {
  const today = kstDay(now);
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  let a = ok(from) ? from : today;
  let b = ok(to) ? to : today;
  if (a > b) [a, b] = [b, a];
  if (b > today) b = today;
  if (a > b) a = b;
  const earliest = addDays(b, -(MAX_CUSTOM_DAYS - 1));
  if (a < earliest) a = earliest;
  const y = today.slice(0, 4);
  const lab = (d: string) => `${d.slice(0, 4) !== y ? `${d.slice(0, 4)}년 ` : ''}${md(d)}`;
  return { from: a, to: b, label: a === b ? lab(a) : `${lab(a)} ~ ${lab(b)}` };
}

/** 범위의 날짜 목록 */
export function daysOf(r: Range): string[] {
  const out: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 범위를 서버에서 읽을 때 쓰는 UTC 시각(KST 0시 기준) */
export function rangeIso(r: Range): { fromIso: string; toIso: string } {
  return { fromIso: new Date(Date.parse(`${r.from}T00:00:00Z`) - 9 * 3600_000).toISOString(), toIso: new Date(Date.parse(`${addDays(r.to, 1)}T00:00:00Z`) - 9 * 3600_000).toISOString() };
}

export const WORK_LABEL: Record<string, string> = {
  question: '질문',
  research: '웹 조사',
  plan: '기획서 초안',
  review: '결과 채점',
  wiki: '위키 정리',
  image: '이미지 분석',
  drawing: '시안 그리기',
  design: '디자인 기준',
  pm: '개발 계획',
  prototype: '견본 만들기',
};
export const workLabel = (purpose: string) => WORK_LABEL[purpose] ?? purpose;

/** Claude가 결과 요약 맨 끝에 적은 "쓴 토큰: 12,345" */
export function loggedTokens(summary: string): number | null {
  const m = summary.match(/^쓴 토큰\s*[:：]\s*([\d,]+)\s*$/m);
  const n = m ? Number(m[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 글자 수 → 토큰 추정(한글·코드 섞임 기준 3자 = 1토큰). 실제로 읽은 파일·생각은 빠져 실제보다 적다 */
export const estimateTokens = (chars: number) => Math.round(chars / 3);

export type TokenSource = 'svc' | 'log' | 'est' | 'none';
export interface WorkLine {
  key: string;
  label: string;
  n: number;
  tokens: number;
}
export interface UsageRow {
  id: UsageAgentId;
  name: string;
  unit: 'token' | 'credit';
  /** 사용 횟수(앱 기록) */
  n: number;
  /** 토큰(unit token) 또는 앱이 센 크레딧(unit credit) */
  amount: number;
  source: TokenSource;
  /** 펼치면 보이는 한 일(Studio: 일 종류, Claude·Codex: 업무, 검색: 검색·본문) */
  work: WorkLine[];
}

const inRange = (iso: string, r: Range) => {
  const d = kstDay(new Date(iso));
  return d >= r.from && d <= r.to;
};
const agentOfCall = (c: UsageCall): UsageAgentId | null =>
  c.provider === 'gemini' ? (c.keySlot === 1 ? 'studioA' : c.keySlot === 2 ? 'studioB' : null) : c.provider === 'tavily' ? 'search' : c.provider === 'firecrawl' ? 'firecrawl' : null;
const agentOfSource = (s: string): 'claude' | 'codex' | null => (s.startsWith('claude') ? 'claude' : s.startsWith('codex') ? 'codex' : null);

function resultTokens(x: UsageResult, input: UsageInput): { tokens: number; logged: boolean } {
  const logged = loggedTokens(x.summary);
  if (logged !== null) return { tokens: logged, logged: true };
  return { tokens: estimateTokens((input.promptChars?.[x.taskId] ?? 0) + x.summary.length + x.diff.length + x.testLog.length), logged: false };
}

/** 기간의 AI별 사용량 */
export function summarize(input: UsageInput, r: Range): UsageRow[] {
  const calls = input.calls.filter((c) => c.ok && inRange(c.createdAt, r));
  const taskTitle = (id: string | null) => {
    const t = input.tasks.find((x) => x.id === id);
    if (!t) return '지운·시험 업무';
    const p = input.projects.find((x) => x.id === t.projectId);
    return p ? `${p.name} · ${t.title}` : t.title;
  };
  return USAGE_AGENTS.map(({ id, name, unit }) => {
    if (id === 'claude' || id === 'codex') {
      const runs = input.runs.filter((x) => x.agent === id && inRange(x.createdAt, r));
      const results = input.results.filter((x) => agentOfSource(x.source) === id && inRange(x.createdAt, r));
      const each = results.map((x) => ({ x, ...resultTokens(x, input) }));
      const amount = each.reduce((a, e) => a + e.tokens, 0);
      const source: TokenSource = !each.length ? 'none' : each.every((e) => e.logged) ? 'log' : 'est';
      const byTask = new Map<string, WorkLine>();
      for (const run of runs) {
        const key = run.taskId ?? '-';
        const line = byTask.get(key) ?? { key, label: taskTitle(run.taskId), n: 0, tokens: 0 };
        line.n += 1;
        byTask.set(key, line);
      }
      for (const e of each) {
        const line = byTask.get(e.x.taskId) ?? { key: e.x.taskId, label: taskTitle(e.x.taskId), n: 0, tokens: 0 };
        line.tokens += e.tokens;
        byTask.set(e.x.taskId, line);
      }
      return { id, name, unit, n: runs.length, amount, source, work: [...byTask.values()].sort((a, b) => b.n - a.n || b.tokens - a.tokens) };
    }
    const mine = calls.filter((c) => agentOfCall(c) === id);
    if (unit === 'credit') {
      const work = new Map<string, WorkLine>();
      for (const c of mine) {
        const key = c.model || 'search';
        const line = work.get(key) ?? { key, label: key === 'scrape' ? '본문 읽기' : '검색', n: 0, tokens: 0 };
        line.n += 1;
        line.tokens += searchCreditsOf([c])[id === 'search' ? 'tavily' : 'firecrawl'];
        work.set(key, line);
      }
      const lines = [...work.values()];
      return { id, name, unit, n: mine.length, amount: lines.reduce((a, l) => a + l.tokens, 0), source: 'svc', work: lines };
    }
    const work = new Map<string, WorkLine>();
    for (const c of mine) {
      const line = work.get(c.purpose) ?? { key: c.purpose, label: workLabel(c.purpose), n: 0, tokens: 0 };
      line.n += 1;
      line.tokens += c.tokens ?? 0;
      work.set(c.purpose, line);
    }
    const lines = [...work.values()].sort((a, b) => b.n - a.n || b.tokens - a.tokens);
    return { id, name, unit, n: mine.length, amount: lines.reduce((a, l) => a + l.tokens, 0), source: 'svc', work: lines };
  });
}

/** 날짜별(통계 막대) AI별 횟수·양 */
export function dailyOf(input: UsageInput, r: Range): { day: string; rows: Record<UsageAgentId, { n: number; amount: number }> }[] {
  // 긴 기간(최대 366일)에서도 가볍게: 기록을 날짜별로 먼저 나눈 뒤 그날 것만 센다
  const byDay = <T extends { createdAt: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) {
      const d = kstDay(new Date(x.createdAt));
      if (d < r.from || d > r.to) continue;
      const list = m.get(d);
      if (list) list.push(x);
      else m.set(d, [x]);
    }
    return m;
  };
  const calls = byDay(input.calls);
  const runs = byDay(input.runs);
  const results = byDay(input.results);
  return daysOf(r).map((day) => {
    const one = summarize({ ...input, calls: calls.get(day) ?? [], runs: runs.get(day) ?? [], results: results.get(day) ?? [] }, { from: day, to: day, label: day });
    return { day, rows: Object.fromEntries(one.map((x) => [x.id, { n: x.n, amount: x.amount }])) as Record<UsageAgentId, { n: number; amount: number }> };
  });
}

/** 프로젝트별 Claude·Codex 횟수(통계) */
export function byProject(input: UsageInput, r: Range): { name: string; claude: number; codex: number }[] {
  const out = new Map<string, { name: string; claude: number; codex: number }>();
  for (const run of input.runs) {
    if ((run.agent !== 'claude' && run.agent !== 'codex') || !inRange(run.createdAt, r)) continue;
    const t = input.tasks.find((x) => x.id === run.taskId);
    const name = t ? input.projects.find((p) => p.id === t.projectId)?.name ?? '프로젝트 없음' : '지운·시험 업무';
    const line = out.get(name) ?? { name, claude: 0, codex: 0 };
    line[run.agent] += 1;
    out.set(name, line);
  }
  return [...out.values()].sort((a, b) => b.claude + b.codex - (a.claude + a.codex));
}

/** 짧은 숫자(1.2k) */
export const shortNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

/** 한 줄 글: "5회 · 36.9k 토큰", "0회 · 0 토큰", "5회 · 크레딧 5", 추정이면 "약" */
export function usageText(row: UsageRow): string {
  if (row.unit === 'credit') return `${row.n}회 · 크레딧 ${row.amount.toLocaleString('ko-KR')}`;
  return `${row.n}회 · ${row.source === 'est' ? '약 ' : ''}${shortNum(row.amount)} 토큰`;
}

export const SOURCE_LABEL: Record<TokenSource, string> = {
  svc: '서비스가 알려 준 값',
  log: 'Claude 세션 기록',
  est: '추정(지시서·결과 글자 수)',
  none: '기록 없음',
};
