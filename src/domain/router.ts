import { AGENT_BY_ID, AGENTS, CANDIDATES } from './agents';
import { remainingToday } from './usage';
import type { AgentId, RequestedType, UsageRun, WorkType } from './types';
import { WORK_TYPE_LABEL } from './types';

const KEYWORDS: Record<WorkType, string[]> = {
  planning: ['기획', '설계', '아키텍처', '스펙', '요구사항', '로드맵', '구조', 'plan', 'spec', 'architecture', 'roadmap'],
  dev: ['구현', '개발', '버그', '수정', '리팩터', '코드', '기능', '연동', '마이그레이션', 'api', 'fix', 'bug', 'implement', 'refactor'],
  design: ['디자인', 'ui', 'ux', '화면', '레이아웃', '색상', '아이콘', '도트', '스프라이트', '캐릭터', 'style'],
  prototype: ['프로토타입', '시안', '견본', '목업', '데모', 'mockup', 'prototype', 'poc'],
  research: ['조사', '리서치', '비교', '트렌드', '검색', '분석', '시장', 'research', 'compare'],
  qa: ['테스트', '검수', 'qa', '리뷰', '점검', 'ci', '회귀', 'test', 'review'],
};

/** 동점일 때 이 순서가 이긴다. */
const TIE_ORDER: WorkType[] = ['dev', 'planning', 'qa', 'design', 'prototype', 'research'];

export interface RouteInput {
  title: string;
  description: string;
  requestedType: RequestedType;
}

export interface RouteResult {
  type: WorkType;
  assignee: AgentId;
  reason: string;
}

/**
 * 키워드가 문장에 있는지. 영어 키워드는 단어 단위로만 본다('TestRepo'의 test, 'decision'의 ci는 아님).
 * 한국어는 조사가 붙으므로('테스트를') 들어 있기만 하면 된다.
 */
function hasKeyword(lower: string, k: string): boolean {
  if (!/^[a-z]+$/.test(k)) return lower.includes(k);
  return new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`).test(lower);
}

export function classify(text: string): { type: WorkType; hits: string[] } | null {
  const lower = text.toLowerCase();
  let best: { type: WorkType; hits: string[] } | null = null;
  for (const type of TIE_ORDER) {
    const hits = KEYWORDS[type].filter((k) => hasKeyword(lower, k));
    if (hits.length > 0 && (!best || hits.length > best.hits.length)) best = { type, hits };
  }
  return best;
}

/** 모델 호출 없이 규칙만으로 유형과 담당자를 정한다. */
export function routeTask(input: RouteInput, usage: UsageRun[], now: Date = new Date(), leave: AgentId[] = []): RouteResult {
  let type: WorkType;
  let why: string;
  if (input.requestedType !== 'auto') {
    type = input.requestedType;
    why = `요청 유형 ${WORK_TYPE_LABEL[type]}`;
  } else {
    const found = classify(`${input.title} ${input.description}`);
    if (found) {
      type = found.type;
      why = `키워드 '${found.hits.slice(0, 3).join("', '")}' → ${WORK_TYPE_LABEL[type]}`;
    } else {
      type = 'planning';
      why = '해당 키워드 없음 → 기획·설계부터';
    }
  }

  // 휴가 중인 AI는 빼고(v0.4.39), 후보가 모두 휴가면 이 일을 할 줄 아는 다른 AI에게 맡긴다.
  const onLeave = (id: AgentId) => leave.includes(id);
  const away = CANDIDATES[type].filter(onLeave);
  let candidates = CANDIDATES[type].filter((id) => !onLeave(id));
  if (!candidates.length) candidates = AGENTS.filter((a) => a.skills.includes(type) && !onLeave(a.id)).map((a) => a.id);
  const leaveNote = away.length ? `, ${away.map((id) => AGENT_BY_ID[id].name).join('·')} 휴가` : '';
  if (!candidates.length) {
    const primary = CANDIDATES[type][0];
    return { type, assignee: primary, reason: `${why}${leaveNote} → ${AGENT_BY_ID[primary].name} (할 수 있는 AI가 모두 휴가, 복귀 뒤 실행)` };
  }
  const available = candidates.find((id) => remainingToday(usage, id, now) > 0);
  if (available) {
    const skipped = candidates.slice(0, candidates.indexOf(available));
    const skipNote = skipped.length ? `, ${skipped.map((id) => AGENT_BY_ID[id].name).join('·')} 오늘 한도 소진` : '';
    return { type, assignee: available, reason: `${why}${leaveNote}${skipNote} → ${AGENT_BY_ID[available].name}` };
  }
  const primary = candidates[0];
  return {
    type,
    assignee: primary,
    reason: `${why}${leaveNote} → ${AGENT_BY_ID[primary].name} (후보 모두 오늘 한도 소진, 내일 실행)`,
  };
}
