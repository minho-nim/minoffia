// 캐릭터 표시 하나(v0.4.35): 사무실 말풍선·에이전트 카드가 같은 값을 쓴다.
// 업무 단계 말풍선(speech.ts)이 있으면 그것, 없으면 업무 상태로 정한 작은 표시. 우선순위 ! > ? > … > 없음(휴식).
import type { AgentId, Task } from '../domain/types';
import type { AgentScene } from './scene';
import type { Speech, SpeechKind } from './speech';

/** 말풍선 단계 이름(업무 종류). 단계[표시]로 보인다: 개발[…] · 개발[!] · 검토[?] */
export const WORK_WORD: Record<Task['type'], string> = { planning: '기획', dev: '개발', design: '디자인', prototype: '견본', research: '조사', qa: '검수' };
export const MARK: Partial<Record<AgentScene['activity'], string>> = { working: '…', helping: '…', blocked: '!', review: '?' };
const KIND_OF_MARK: Record<string, SpeechKind> = { '…': 'busy', '!': 'alert', '?': 'ask' };

/** 업무 단계 말풍선이 없을 때의 작은 표시(업무 상태로만): 단계[표시] */
export function badgeFor(s: AgentScene): string | undefined {
  const mark = MARK[s.activity];
  if (!mark || !s.task) return undefined;
  if (s.agent === 'mina') return `접수[${s.task.status === 'blocked' ? '!' : s.task.status === 'review' ? '?' : '…'}]`;
  return `${s.activity === 'review' ? '검토' : WORK_WORD[s.task.type]}[${mark}]`;
}

export interface AgentMark {
  text: string;
  kind: SpeechKind;
  label: string;
}

/** 캐릭터 하나의 표시. 없으면 휴식 */
export function markFor(agent: AgentId, scene: AgentScene[], speech: Map<AgentId, Speech>): AgentMark | undefined {
  const say = speech.get(agent);
  if (say) return { text: say.text, kind: say.kind, label: say.label };
  const s = scene.find((x) => x.agent === agent);
  const badge = s ? badgeFor(s) : undefined;
  if (!badge || !s) return undefined;
  const m = badge.match(/\[(.)\]$/)?.[1] ?? '…';
  return { text: badge, kind: KIND_OF_MARK[m] ?? 'busy', label: s.task ? s.task.title : badge };
}
