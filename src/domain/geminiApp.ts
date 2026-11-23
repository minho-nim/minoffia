/**
 * Gemini 앱에서 이어 하기(v0.8.4): 유튜브 요약이 미노피아에서 안 될 때(비공개·너무 긴 영상·한도) 쓰는 예비 길.
 * 요약 부탁 글을 복사하고 Gemini 앱(웹)을 연다(질문을 미리 채우는 공식 주소가 없어 붙여 넣기).
 */
import { youtubeUrl } from './youtube';

/** Gemini 앱에 붙여 넣을 요약 부탁 글. 링크 말고 따로 물은 게 있으면 그걸 묻는다 */
export function geminiAppPrompt(text: string): string {
  const url = youtubeUrl(text);
  if (!url) return text.trim();
  const ask = text.replace(/(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/\S*/, ' ').replace(/\s+/g, ' ').trim();
  const plain = !ask || /^(요약|정리|요약해\s?줘|정리해\s?줘|이거|이 영상|봐\s?줘|뭐야\??)$/.test(ask);
  return plain ? `이 유튜브 영상을 한국어로 요약해 줘. 핵심을 짧은 목록으로, 중요한 장면은 [분:초]를 붙여서.\n${url}` : `이 유튜브 영상을 보고 답해 줘(한국어): ${ask}\n${url}`;
}

export const GEMINI_APP = 'https://gemini.google.com/app';

/** 복사하고 Gemini 앱 열기(누른 순간에 둘 다 해야 휴대폰이 막지 않는다) */
export function openInGemini(text: string): void {
  void navigator.clipboard?.writeText(geminiAppPrompt(text)).catch(() => undefined);
  window.open(GEMINI_APP, '_blank', 'noopener');
}
