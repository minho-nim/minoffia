// 미노(CI)의 그리기 말풍선(v0.7.4, 소유자 "실제로 하는 역할 그대로"): 앱이 GitHub Actions에 그림(앱 지도·바뀐 곳 구조도)을
// 시킨 동안만 "그림[…]"을 띄운다. 이 기기에서 시킨 것만 알고(다른 기기·서버가 시킨 것은 모름), 끝나거나 10분이 지나면 지운다.
// shortcut: 서버가 시킨 그림(자동 점검 등)은 말풍선이 안 뜬다, Actions 진행 상태를 서버가 기록하게 되면 그걸 읽는다.
import { useSyncExternalStore } from 'react';

const MAX_MS = 10 * 60_000;
let jobs = new Map<string, { label: string; at: number }>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** 그림을 시작했다(같은 key면 덮어씀) */
export function startDrawing(key: string, label: string) {
  jobs = new Map(jobs).set(key, { label, at: Date.now() });
  emit();
}
/** 그림이 끝났다 */
export function endDrawing(key: string) {
  if (!jobs.has(key)) return;
  jobs = new Map(jobs);
  jobs.delete(key);
  emit();
}
/** 지금 그리는 것(가장 최근 하나, 10분 넘은 것은 뺌) */
export function currentDrawing(now = Date.now()): string | null {
  const live = [...jobs.values()].filter((j) => now - j.at < MAX_MS).sort((a, b) => b.at - a.at);
  return live[0]?.label ?? null;
}
export function useDrawing(): string | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      const t = window.setInterval(f, 60_000);
      return () => {
        subs.delete(f);
        window.clearInterval(t);
      };
    },
    () => currentDrawing(),
  );
}
