// 디스코드식 대화창(v0.7.17, 소유자 "디스코드가 보는 화면이 읽기 편해서, 비슷하게"): 말한 쪽을 실제 AI로, 같은 쪽이 연달아 말하면 묶고,
// 업무 알림은 카드(왼쪽 색 막대·프로젝트·업무 이름·점수 칸)로 나눠 보여 준다. 모두 규칙(모델 호출 없음), 저장된 글은 그대로 두고 보이는 모양만.
import type { Stage } from './workflow-types';

export type SpeakerId = 'me' | 'mina' | 'claude' | 'codex' | 'studioA' | 'studioB' | 'search' | 'firecrawl' | 'ci';
export interface Speaker {
  id: SpeakerId;
  name: string;
  /** 이름 옆 작은 표시(접수·기획·계획·개발·평가·검사·배포 등). 없으면 '' */
  role: string;
  /** 함께 일한 쪽(작게, v0.7.97 소유자 "답한 에이전트에 실제 일한 에이전트를 함께"). 예: Tavily 검색, Firecrawl 본문 2 */
  helpers?: string[];
}

export interface ChatMsgLike {
  id: string;
  from: 'me' | 'office' | 'gemini';
  text: string;
  via?: string;
  stage?: string;
  at?: string;
}

const MINA = (role: string): Speaker => ({ id: 'mina', name: '미니엉', role });
const RUN_AI: Record<string, Speaker> = {
  Claude: { id: 'claude', name: 'Claude', role: '개발' },
  Codex: { id: 'codex', name: 'Codex', role: '개발' },
  Gemini: { id: 'studioA', name: 'Gemini', role: '개발' },
};

/** 이 말을 한 쪽(지금 대화창에 보일 이름·얼굴) */
export function speakerOf(m: ChatMsgLike): Speaker {
  if (m.from === 'me') return { id: 'me', name: '나', role: '' };
  if (m.from === 'gemini') {
    const via = m.via ?? '';
    if (via.includes('Claude')) return { id: 'claude', name: 'Claude', role: '웹 조사' };
    // 웹 조사(v0.7.51 Tavily·Firecrawl, 예전 기록은 Exa): "<엔진> 검색 + 본문 n개 + Gemini · Studio A가 답함".
    // v0.7.97: 답한 쪽은 Studio(얼굴·이름), 검색·본문 읽기는 함께 일한 쪽으로 작게
    const web = /(\S+) 검색(?: \+ (본문 (\d+)개|요약만))? \+ Gemini/.exec(via);
    if (web) {
      const helpers = [`${web[1]} 검색`, ...(web[3] ? [`Firecrawl 본문 ${web[3]}`] : [])];
      return via.includes('Studio B') ? { id: 'studioB', name: 'Gemini B', role: '웹 조사', helpers } : { id: 'studioA', name: 'Gemini A', role: '웹 조사', helpers };
    }
    // 날씨(v0.7.68): 모델 없이 규칙으로 답함 → 미니엉, 자료는 날씨 서버
    const wx = /^(\S+(?: \S+)?) 자료 · 규칙으로 답함/.exec(via);
    if (wx) return { ...MINA('날씨'), helpers: [wx[1]] };
    if (via.includes('Studio B')) return { id: 'studioB', name: 'Gemini B', role: '답변' };
    return { id: 'studioA', name: 'Gemini A', role: '답변' };
  }
  if (m.id.startsWith('act-')) return MINA('기록');
  if (m.id.startsWith('stale-')) return MINA('알림');
  if (!m.id.startsWith('stage-')) return MINA('접수');
  switch (m.stage as Stage | undefined) {
    case 'received':
    case 'planner_handoff':
    case 'needs_clarification':
    case 'spec_ready':
    case 'development_approval_pending':
      return { id: 'studioA', name: 'Gemini A', role: '기획' };
    case 'pm_queued':
    case 'dispatching':
    case 'agent_handoff_pending':
      return { id: 'claude', name: 'Claude', role: '계획' };
    case 'executing': {
      const who = m.text.match(/(Claude|Codex|Gemini)\(W/)?.[1];
      return who ? RUN_AI[who] : MINA('개발');
    }
    case 'validation':
    case 'result_review':
    case 'github_approval_pending':
      return /평가/.test(m.text) ? { id: 'studioA', name: 'Gemini A·B + 동료', role: '평가' } : MINA('결과');
    case 'github_uploading':
    case 'pr_review':
    case 'deployment_approval_pending':
    case 'deploying':
    case 'completed':
      return { id: 'ci', name: '미노', role: '검사·배포' };
    default:
      return MINA('알림');
  }
}

/** 카드 색: 내 차례(주황)·진행 중(파랑)·끝(초록)·문제(빨강) */
export type CardTone = 'turn' | 'info' | 'ok' | 'bad';
const TURN = new Set(['needs_clarification', 'spec_ready', 'development_approval_pending', 'result_review', 'github_approval_pending', 'deployment_approval_pending']);
export function toneOf(stage: string | undefined, text = ''): CardTone {
  if (stage === 'failed' || stage === 'integration_blocked' || stage === 'rate_limited' || /실패|막혔/.test(text.split('\n')[0] ?? '') || /배포하지 못했어요/.test(text)) return 'bad';
  if (stage === 'completed') return 'ok';
  if (stage && TURN.has(stage) && !/검사\(CI\)하는 중/.test(text)) return 'turn';
  return 'info';
}

export interface CardField {
  label: string;
  value: string;
}
export interface NoticeCard {
  project: string;
  title: string;
  /** 단계 이름(→ 뒤). 사장님이 누른 기록이면 '' 일 수 있음 */
  label: string;
  /** 사장님이 누른 것·한 일(— 뒤, → 앞) */
  did: string;
  /** 요약 한 줄(평가: '평균 94점 → 검토 통과'), 없으면 '' */
  headline: string;
  fields: CardField[];
  lines: string[];
}

const SCORE_ITEM = /^(.*?)\s+(\d+점|기다리는 중|빠짐|점수 없음)$/;

/** 업무 알림 글을 카드로 나눈다. 알림 모양이 아니면 null(그냥 글로 보여 줌) */
export function noticeCard(text: string): NoticeCard | null {
  const [first, ...rest] = text.split('\n');
  const m = first.match(/^(?:\[([^\]]+)\]\s*)?'(.+?)'\s*(→|—)\s*(.*)$/);
  if (!m) return null;
  const project = m[1] ?? '';
  const title = m[2];
  let label = '';
  let did = '';
  if (m[3] === '→') label = m[4].trim();
  else {
    const i = m[4].lastIndexOf(' → ');
    did = (i >= 0 ? m[4].slice(0, i) : m[4]).trim();
    label = i >= 0 ? m[4].slice(i + 3).trim() : '';
  }
  let headline = '';
  const fields: CardField[] = [];
  const lines: string[] = [];
  for (const line of rest.filter((l) => l.trim())) {
    const ev = line.match(/^평가(?:\s+평균\s+(\d+점))?(?:\((.*)\))?\s*→\s*(.+)$/);
    if (ev && !fields.length) {
      headline = [ev[1] ? `평균 ${ev[1]}` : '', ev[3]].filter(Boolean).join(' · ');
      for (const part of (ev[2] ?? '').split(' · ')) {
        const s = part.trim().match(SCORE_ITEM);
        if (s) fields.push({ label: s[1], value: s[2] });
      }
      continue;
    }
    const dr = line.match(/^시안 \d+장:\s*(.*?)(?:\s+—\s+(.*))?$/);
    if (dr && !fields.length) {
      for (const part of dr[1].split(' · ')) {
        const s = part.trim().match(/^([AB])\((.*)\)\s+(.+)$/);
        if (s) fields.push({ label: `시안 ${s[1]} · ${s[2]}`, value: s[3] });
      }
      if (dr[2]) lines.push(dr[2]);
      continue;
    }
    lines.push(line);
  }
  return { project, title, label, did, headline, fields, lines };
}

/** 메시지를 만든 시각(ms). 알림은 at, 일반 메시지는 id 앞의 시각. 모르면 null */
export function timeOf(m: { id: string; at?: string }): number | null {
  if (m.at) {
    const t = Date.parse(m.at);
    return Number.isNaN(t) ? null : t;
  }
  const d = m.id.match(/^(\d{13})-/);
  return d ? Number(d[1]) : null;
}

/** 같은 쪽이 5분 안에 이어 말하면 이름·얼굴을 한 번만 */
export function continues(prev: ChatMsgLike | undefined, cur: ChatMsgLike): boolean {
  if (!prev) return false;
  const a = speakerOf(prev);
  const b = speakerOf(cur);
  if (a.id !== b.id || a.name !== b.name) return false;
  const ta = timeOf(prev);
  const tb = timeOf(cur);
  return ta !== null && tb !== null && tb - ta >= 0 && tb - ta < 5 * 60_000;
}

const kst = (t: number) => new Date(t + 9 * 3600_000);

/** 날짜 구분선 글(한국 시간): 오늘·어제·M월 D일 */
export function dayLabel(t: number, now = Date.now()): string {
  const d = kst(t).toISOString().slice(0, 10);
  const today = kst(now).toISOString().slice(0, 10);
  const yesterday = kst(now - 86400_000).toISOString().slice(0, 10);
  if (d === today) return '오늘';
  if (d === yesterday) return '어제';
  const k = kst(t);
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

/** 이름 옆 시각(한국 시간): 오전/오후 h:mm */
export function clockLabel(t: number): string {
  const k = kst(t);
  const h = k.getUTCHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}

/** 버튼과 같은 말을 하는 안내 줄(v0.7.18 소유자 "카드 안 안내 줄 빼기"): 버튼이 보일 때만 숨긴다 */
const GUIDE = [
  /^기획서를 보고 기획 승인하거나 수정 요청하세요\.?$/,
  /^결과를 보고 결과 승인/,
  /^업무 카드에서 하나를 고를 수 있어요\.?$/,
  /^업무 카드에서 /,
];
export const isGuideLine = (line: string) => GUIDE.some((r) => r.test(line.trim()));

/** 카드의 기획서 줄을 짧게: 'v1: ' 머리를 떼고 한 줄 길이로 */
export function shortSpecLine(line: string, max = 90): string {
  const t = line.replace(/^기획서 v\d+:\s*/, '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
