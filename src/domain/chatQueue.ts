// 답을 기다리는 동안 보낸 말 처리(v0.4.59, 소유자 2026-11-01 "클로드처럼"): 몰려온 말은 하나로 합쳐 한 번에 읽는다.
// 쪼개 보낸 말("MuscleMap에" → "다크 모드 넣어줘")을 한 요청으로 이해하고, Gemini도 한 번만 부른다.
// 서로 다른 질문·업무가 섞여 있으면 합친 뒤 AI가 다시 나눈다(parseRoutedAll). "응"·"아니" 같은 짧은 대답은 합치지 않는다(접수 카드 대답).
import { replyIntent } from './triage';

export interface Queued<F = unknown> {
  text: string;
  files: F[];
}

/** 합쳐도 되는 길이(ask-gemini 질문 상한 4000자 안) */
export const MAX_MERGED = 3800;

/** 짧은 확인 대답인지(접수 카드·확인 질문에 답하는 말) */
export function isShortReply(text: string): boolean {
  const t = text.trim();
  return t.length <= 12 && !/[?？]/.test(t) && replyIntent(t) !== null;
}

/**
 * 줄 선 말에서 이번에 처리할 묶음을 꺼낸다. 맨 앞이 짧은 대답이면 그것 하나만,
 * 아니면 다음 짧은 대답 전까지(길이 상한 안) 이어진 말을 줄바꿈으로 합친다.
 */
export function takeQueued<F>(queue: Queued<F>[]): { next: Queued<F> | null; rest: Queued<F>[]; merged: number } {
  if (!queue.length) return { next: null, rest: [], merged: 0 };
  if (isShortReply(queue[0].text)) return { next: queue[0], rest: queue.slice(1), merged: 1 };
  let n = 0;
  let len = 0;
  while (n < queue.length && !isShortReply(queue[n].text) && (n === 0 || len + queue[n].text.length + 1 <= MAX_MERGED)) {
    len += queue[n].text.length + (n ? 1 : 0);
    n += 1;
  }
  const part = queue.slice(0, n);
  return {
    next: { text: part.map((q) => q.text).join('\n'), files: part.flatMap((q) => q.files) },
    rest: queue.slice(n),
    merged: n,
  };
}
