/**
 * 유튜브 링크는 Gemini 앱에서 요약(v0.8.4 소유자 "제미나이 앱에서 하는 걸로"): 미노피아 무료 키 한도를 아끼려고
 * API로 영상을 보내지 않는다. 규칙으로 유튜브 주소를 찾으면(모델 0) 요약 부탁 글을 복사하고 Gemini 앱(웹)을 연다.
 */
const YT = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^\s#]*?&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** 글 속 첫 유튜브 영상 → 표준 주소(없으면 null) */
export function youtubeUrl(text: string): string | null {
  const m = YT.exec(text);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

/** Gemini 앱에 붙여 넣을 요약 부탁 글. 링크 말고 따로 물은 게 있으면 그걸 묻는다 */
export function geminiAppPrompt(text: string): string {
  const url = youtubeUrl(text);
  if (!url) return text.trim();
  const ask = text.replace(new RegExp(`${YT.source}\\S*`), ' ').replace(/\s+/g, ' ').trim();
  const plain = !ask || /^(요약|정리|요약해\s?줘|정리해\s?줘|이거|이 영상|봐\s?줘|뭐야\??)$/.test(ask);
  return plain ? `이 유튜브 영상을 한국어로 요약해 줘. 핵심을 짧은 목록으로, 중요한 장면은 [분:초]를 붙여서.\n${url}` : `이 유튜브 영상을 보고 답해 줘(한국어): ${ask}\n${url}`;
}

export const GEMINI_APP = 'https://gemini.google.com/app';

/** 복사하고 Gemini 앱 열기(누른 순간에 둘 다 해야 휴대폰이 막지 않는다) */
export function openInGemini(text: string): void {
  void navigator.clipboard?.writeText(geminiAppPrompt(text)).catch(() => undefined);
  window.open(GEMINI_APP, '_blank', 'noopener');
}

export const YT_NOTE = '유튜브 요약은 Gemini 앱에서 해요(미노피아 무료 한도를 아끼려고). 버튼을 누르면 요약 부탁 글이 복사되고 Gemini가 열려요. 입력칸에 붙여 넣기만 하세요.';
