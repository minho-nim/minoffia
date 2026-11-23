// 채팅 문서 첨부(v0.8.15 소유자 "채팅은 사진만 붙일 수 있습니다. 이거 채팅에도 필요"):
// 업무 대화와 같은 문서(PDF·글·Office)를 받는다. 저장소에는 올리지 않고 이번 질문에만 함께 보낸다.
// PDF는 Gemini가 직접 읽고(inline_data), 글·Office는 브라우저에서 글을 뽑아 text/plain으로 보낸다.
import { docMime } from './attachments';

export type ChatFileKind = 'image' | 'pdf' | 'text' | 'office';

/** 서버 ask-gemini와 같아야 한다(chatDocs.test.ts가 확인) */
export const CHAT_INLINE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'];
/** 함께 보낼 수 있는 파일 수(사진 3장 포함) */
export const MAX_CHAT_FILES = 5;
export const MAX_CHAT_PHOTOS = 3;
/** 보내는 합계(base64 풀기 전 원본 기준). 서버도 같은 값으로 막는다 */
export const MAX_CHAT_INLINE_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_PHOTO_BYTES = 5 * 1024 * 1024;
/** 문서 하나에서 보낼 글자 수(넘으면 앞부분만) */
export const MAX_DOC_CHARS = 60_000;

export const CHAT_ACCEPT = ['image/*', '.pdf', '.txt', '.md', '.csv', '.json', '.html', '.htm', '.docx', '.xlsx', '.pptx'].join(',');

const OFFICE = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** 채팅에 붙일 수 있는 파일이면 종류, 아니면 null(ZIP·SVG는 채팅에서 읽지 않는다) */
export function chatFileKind(file: { name: string; type: string }): ChatFileKind | null {
  if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return 'image';
  const mime = docMime(file);
  if (!mime) return null;
  if (mime === 'application/pdf') return 'pdf';
  if (OFFICE.has(mime)) return 'office';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return null;
}

/** 뽑은 글 → 보낼 글(파일 이름 머리말, 길면 앞부분만) */
export function docText(name: string, text: string, max = MAX_DOC_CHARS): string {
  const body = text.replace(/\r\n?/g, '\n').trim();
  const cut = body.length > max;
  return `[첨부 파일: ${name}${cut ? ` (앞 ${max.toLocaleString('ko-KR')}자만)` : ''}]\n${cut ? body.slice(0, max) : body}`;
}

/** 글을 UTF-8 base64로(한글이 깨지지 않게) */
export function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** 질문이 비었을 때 기본 질문 */
export function defaultAsk(kinds: ChatFileKind[]): string {
  return kinds.every((k) => k === 'image') ? '이 사진 설명해 줘' : kinds.some((k) => k === 'image') ? '첨부한 사진과 문서 설명해 줘' : '이 문서 요약해 줘';
}

/** 붙이기 전 검사: 넣을 파일과 오류 한 줄 */
export function pickChatFiles(have: { type: string; size: number; name: string }[], incoming: File[]): { ok: File[]; error: string } {
  const ok: File[] = [];
  let error = '';
  const photos = () => [...have, ...ok].filter((f) => chatFileKind(f) === 'image').length;
  const total = () => [...have, ...ok].filter((f) => ['image', 'pdf'].includes(chatFileKind(f) ?? '')).reduce((n, f) => n + f.size, 0);
  for (const f of incoming) {
    const kind = chatFileKind(f);
    if (!kind) error = `${f.name}: 사진·PDF·글(txt·md·csv·json·html)·Word·Excel·PowerPoint만 붙일 수 있어요.`;
    else if (have.length + ok.length >= MAX_CHAT_FILES) error = `파일은 ${MAX_CHAT_FILES}개까지예요.`;
    else if (kind === 'image' && photos() >= MAX_CHAT_PHOTOS) error = `사진은 ${MAX_CHAT_PHOTOS}장까지예요.`;
    else if (kind === 'image' && f.size > MAX_CHAT_PHOTO_BYTES) error = `${f.name}: 사진은 5MB까지예요.`;
    else if (f.size <= 0) error = `${f.name}: 빈 파일이에요.`;
    // 글·Office는 뽑은 글만 가므로 원본 크기를 합계에 넣지 않는다(PDF·사진만)
    else if ((kind === 'image' || kind === 'pdf') && total() + f.size > MAX_CHAT_INLINE_BYTES) error = `${f.name}: 사진·PDF는 합계 8MB까지예요.`;
    else if ((kind === 'text' || kind === 'office') && f.size > 20 * 1024 * 1024) error = `${f.name}: 문서는 20MB까지예요.`;
    else ok.push(f);
  }
  return { ok, error };
}
