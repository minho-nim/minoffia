/**
 * AI별 오늘 한도 상태(v0.2 §6: known/unknown/exhausted).
 * 공급자의 남은 토큰은 알 수 없다. 이 오피스가 기록한 횟수와 받은 한도 오류(429)로만 판단하고,
 * 셀 수 없는 AI(ChatGPT·Codex 등)는 '알 수 없음'으로 정직하게 둔다.
 */
import { creditLine, FREE_MONTHLY, type Credits } from './searchCredits';
import { AGENT_BY_ID } from './agents';
import type { AgentId, AiCall, Snapshot } from './types';
import { kstDay, runsToday } from './usage';

export type QuotaState = 'available' | 'exhausted' | 'unknown';

export interface QuotaInfo {
  state: QuotaState;
  /** 짧은 표시(칩) */
  label: string;
  /** 근거 */
  detail: string;
}

/** 서버 기본 상한, 키마다 따로(v0.7.80. secret으로 바꿀 수 있어 화면 값은 기본값 기준) */
export const GEMINI_QUESTION_CAP = 40;
export const GEMINI_IMAGE_CAP = 20;

export const QUOTA_STATE_LABEL: Record<QuotaState, string> = {
  available: '사용 가능',
  exhausted: '오늘 소진',
  unknown: '알 수 없음',
};

const today = (iso: string, now: Date) => kstDay(new Date(iso)) === kstDay(now);

/** 토큰 수 짧게(1.2k) */
export const shortTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

/**
 * 오늘 Gemini 성공 호출 횟수·실제 토큰(v0.7.77 소유자 "에이전트 탭 토큰이랑 오늘 사용량 토큰이 안 맞아").
 * 에이전트 탭 Studio A = 1번 키, B = 2번 키(v0.7.82부터 오늘 사용량에는 Gemini 줄 없음). 웹 조사 종합도 센다.
 */
export function geminiToday(calls: AiCall[], now: Date = new Date(), slot?: 1 | 2) {
  const todays = calls.filter((c) => today(c.createdAt, now) && (slot === undefined || c.keySlot === slot));
  const ok = todays.filter((c) => c.ok);
  const tokens = ok.reduce((n, c) => n + (c.tokens ?? 0), 0);
  // v0.7.84: 질문은 purpose question만(기획서 초안·채점·위키는 따로, 서버 질문 상한과 같은 기준)
  const count = (p: string) => ok.filter((c) => c.purpose === p).length;
  return {
    todays,
    calls: ok.length,
    tokens,
    question: count('question'),
    research: count('research'),
    image: count('image'),
    text: tokens ? `${ok.length}회 · ${shortTokens(tokens)} 토큰` : `${ok.length}회`,
  };
}

function gemini(calls: AiCall[], now: Date, slot: 1 | 2): QuotaInfo {
  const all = geminiToday(calls, now);
  const mine = geminiToday(calls, now, slot);
  const last = mine.todays[mine.todays.length - 1];
  // v0.7.80 소유자 "제미나이 계산은 키마다 나눠": 서버 하루 상한도 키마다 따로(질문 40·이미지 20씩). 다 쓴 키는 건너뛰고 다른 키가 답한다
  const detail = `${slot}번 키 오늘 성공 ${mine.text}(질문 ${mine.question}/${GEMINI_QUESTION_CAP}·웹 조사 ${mine.research}·이미지 ${mine.image}/${GEMINI_IMAGE_CAP}, 상한은 키마다 따로). 두 키 합계 ${all.text}. 무료 한도 숫자는 Google이 계정마다 정한다.`;
  if (last && !last.ok && last.httpStatus === 429) return { state: 'exhausted', label: '오늘 소진', detail: `이 키의 마지막 호출이 무료 한도(429)에 걸렸다. ${detail}` };
  if (mine.question >= GEMINI_QUESTION_CAP && mine.image >= GEMINI_IMAGE_CAP) return { state: 'exhausted', label: '오늘 소진', detail };
  return { state: 'available', label: mine.text, detail };
}

export function quotaFor(agent: AgentId, snap: Snapshot, now: Date = new Date(), live?: { tavily: Credits | null; firecrawl: Credits | null } | null): QuotaInfo {
  switch (agent) {
    case 'claude': {
      const cap = AGENT_BY_ID.claude.dailyCap ?? 0;
      const used = runsToday(snap.usage, 'claude', now);
      const limited = snap.tasks.some((t) => t.dispatch.error?.includes('HTTP 429') && t.dispatch.at && today(t.dispatch.at, now));
      if (used >= cap) return { state: 'exhausted', label: '오늘 소진', detail: `AI Office 상한 ${cap}회를 모두 썼다(내일 0시 KST 초기화).` };
      if (limited) return { state: 'exhausted', label: '시간당 한도', detail: '오늘 루틴 한도 오류(429)를 받았다. 1시간 뒤 다시 시도한다.' };
      return { state: 'available', label: `${used}/${cap}회`, detail: `오늘 Claude PM 전달 ${used}회(상한 ${cap}). Claude Pro 전체 사용량은 알 수 없다.` };
    }
    case 'studioA':
      return gemini(snap.aiCalls ?? [], now, 1);
    case 'studioB':
      return gemini(snap.aiCalls ?? [], now, 2);
    case 'mina':
      return { state: 'unknown', label: '알 수 없음', detail: 'ChatGPT Plus 사용량은 앱에서 알 수 없다(수동 인계, 추가 비용 없음).' };
    case 'codex':
      return { state: 'unknown', label: '알 수 없음', detail: `Codex(ChatGPT Plus) 사용량은 앱에서 알 수 없다. 오늘 수동 시작 기록 ${runsToday(snap.usage, 'codex', now)}회.` };
    case 'search':
    case 'firecrawl': {
      // v0.7.53: 이번 달 남은 크레딧. v0.7.79 소유자 "키랑 사용량 계산은 화면상 모두 연결?": 오늘 사용량·펼친 칸처럼
      // 서비스가 알려 준 실제 값을 먼저 쓰고, 없을 때만 앱이 센 추정(줄 칩만 추정을 써서 숫자가 달랐다)
      const engine = agent === 'search' ? 'tavily' : 'firecrawl';
      const real = live?.[engine] ?? null;
      const used = real ? real.used : snap.searchCredits?.[engine];
      const limit = real ? real.limit : FREE_MONTHLY[engine];
      const left = used === undefined ? null : limit - used;
      const what = engine === 'tavily' ? 'Tavily: 1단계 찾기(검색 1번 = 1크레딧)' : 'Firecrawl: 2단계 본문 읽기(본문 1개 = 1, 찾기 대신 = 2크레딧)';
      const line = creditLine(engine, real ? undefined : used, real);
      if (left !== null && left <= 0) return { state: 'exhausted', label: real ? '이번 달 소진' : '이번 달 소진(추정)', detail: `${what}. ${line}.` };
      return { state: 'available', label: left === null ? '기록 없음' : `남은 ${real ? '' : '약 '}${left.toLocaleString('ko-KR')}`, detail: `${what}. ${line}.` };
    }
    case 'ci':
      return { state: 'unknown', label: '해당 없음', detail: 'GitHub Actions 무료 범위에서 돈다. AI 사용량이 아니다.' };
  }
}
