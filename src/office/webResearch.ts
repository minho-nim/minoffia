// 웹 조사 연출(v0.7.60 소유자 "Tavily·Firecrawl 조사 이런 거도 (리서치실로) 가게 해"): 대화에서 웹 조사를 묻는 동안
// Tavily·Firecrawl이 리서치실 자기 자리로 가서 일하고(찾기[…]·본문[…]), 답이 쓰이기 시작하면 Gemini가 정리[…]. 끝나면 쉰다.
// 이 기기에서 물은 것만 안다(다른 기기의 조사는 모름). 2분이 지나면 저절로 지운다.
import { useSyncExternalStore } from 'react';

export type ResearchPhase = { step: 'search' | 'write'; studio: 'studioA' | 'studioB'; at: number } | null;
const MAX_MS = 2 * 60_000;
let phase: ResearchPhase = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** 찾는 중(Tavily·Firecrawl) → 쓰는 중(Gemini) → 끝(null) */
export function setResearchPhase(step: 'search' | 'write' | null, studio: 'studioA' | 'studioB' = 'studioA') {
  phase = step ? { step, studio, at: Date.now() } : null;
  emit();
}
export function currentResearch(now = Date.now()): ResearchPhase {
  return phase && now - phase.at < MAX_MS ? phase : null;
}
export function useResearchPhase(): ResearchPhase {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      const t = window.setInterval(f, 30_000);
      return () => {
        subs.delete(f);
        window.clearInterval(t);
      };
    },
    () => currentResearch(),
  );
}
