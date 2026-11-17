/**
 * AI별 오늘 한도 상태(v0.2 §6: known/unknown/exhausted).
 * 공급자의 남은 토큰은 알 수 없다. 이 오피스가 기록한 횟수와 받은 한도 오류(429)로만 판단하고,
 * 셀 수 없는 AI(ChatGPT·Codex 등)는 '알 수 없음'으로 정직하게 둔다.
 */
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

/** 서버 기본 상한(secret으로 바꿀 수 있어 화면 값은 기본값 기준) */
export const GEMINI_QUESTION_CAP = 40;
export const GEMINI_IMAGE_CAP = 20;

export const QUOTA_STATE_LABEL: Record<QuotaState, string> = {
  available: '사용 가능',
  exhausted: '오늘 소진',
  unknown: '알 수 없음',
};

const today = (iso: string, now: Date) => kstDay(new Date(iso)) === kstDay(now);

function gemini(calls: AiCall[], now: Date): QuotaInfo {
  const todays = calls.filter((c) => today(c.createdAt, now));
  const q = todays.filter((c) => c.ok && c.purpose === 'question').length;
  const img = todays.filter((c) => c.ok && c.purpose === 'image').length;
  const last = todays[todays.length - 1];
  const detail = `오늘 질문 ${q}/${GEMINI_QUESTION_CAP}회, 이미지 분석 ${img}/${GEMINI_IMAGE_CAP}회(서버 기본 상한). 무료 한도 숫자는 Google이 정한다.`;
  if (last && !last.ok && last.httpStatus === 429) return { state: 'exhausted', label: '오늘 소진', detail: `마지막 호출이 무료 한도(429)에 걸렸다. ${detail}` };
  if (q >= GEMINI_QUESTION_CAP && img >= GEMINI_IMAGE_CAP) return { state: 'exhausted', label: '오늘 소진', detail };
  return { state: 'available', label: `질문 ${q}·이미지 ${img}`, detail };
}

export function quotaFor(agent: AgentId, snap: Snapshot, now: Date = new Date()): QuotaInfo {
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
    case 'studioB':
      return gemini(snap.aiCalls ?? [], now);
    case 'mina':
      return { state: 'unknown', label: '알 수 없음', detail: 'ChatGPT Plus 사용량은 앱에서 알 수 없다(수동 인계, 추가 비용 없음).' };
    case 'codex':
      return { state: 'unknown', label: '알 수 없음', detail: `Codex(ChatGPT Plus) 사용량은 앱에서 알 수 없다. 오늘 수동 시작 기록 ${runsToday(snap.usage, 'codex', now)}회.` };
    case 'search': {
      const todays = (snap.aiCalls ?? []).filter((c) => c.purpose === 'research' && today(c.createdAt, now));
      const ok = todays.filter((c) => c.ok).length;
      return { state: 'available', label: `오늘 조사 ${ok}회`, detail: `오늘 웹 조사 ${ok}회 답함(Tavily로, 안 되면 Firecrawl로 찾고 Gemini가 정리). 무료 크레딧은 각 대시보드에서 본다(Tavily 월 1,000, Firecrawl 월 1,000).` };
    }
    case 'ci':
      return { state: 'unknown', label: '해당 없음', detail: 'GitHub Actions 무료 범위에서 돈다. AI 사용량이 아니다.' };
  }
}
