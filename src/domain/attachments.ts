import type { WorkflowView } from './workflow';

/**
 * 이미지 첨부(v0.2 §4, §7). 원본은 비공개 저장소에 두고, 화면에는 만료되는 주소로만 보여 준다.
 * 규칙은 supabase/migrations/0004_attachments.sql 과 같아야 한다.
 */

/** request = 업무 요청 자료(GPT·PM·개발 AI에 넘김), result = 결과 패키지의 스크린샷 */
export type AttachmentKind = 'request' | 'result';
export type AttachmentRole = 'current' | 'target' | 'error' | 'reference' | 'before' | 'after';

export interface Attachment {
  id: string;
  taskId: string;
  kind: AttachmentKind;
  /** 결과 스크린샷이면 결과 패키지 버전 */
  resultRevision: number | null;
  /** 같은 묶음 안의 순서(0부터) */
  position: number;
  role: AttachmentRole;
  note: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  /** Supabase: `<owner>/<task>/<sha256>.<ext>`, 로컬 데모: `local:<sha256>` */
  storagePath: string;
  createdAt: string;
}

export const ROLE_LABEL: Record<AttachmentRole, string> = {
  current: '현재 화면',
  target: '목표·참고 디자인',
  error: '오류 화면',
  reference: '기타 참고',
  before: '변경 전',
  after: '변경 후',
};

export const ROLES_FOR: Record<AttachmentKind, AttachmentRole[]> = {
  request: ['current', 'target', 'error', 'reference'],
  result: ['after', 'before'],
};

export const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 파일 하나 5MB. Supabase 무료 저장소(1GB)를 아끼려고 둔 상한이다. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_REQUEST_FILES = 10;
export const MAX_RESULT_FILES = 6;
/** 계정 전체 첨부 합계 상한(무료 1GB 중 900MB) */
export const MAX_TOTAL_BYTES = 900 * 1024 * 1024;

const EXT_OK: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
};

/** 문제가 있으면 한국어 이유, 없으면 null */
export function validateFile(file: { name: string; type: string; size: number }): string | null {
  if (!MIME_EXT[file.type]) return `${file.name}: PNG·JPG·WEBP·GIF 이미지만 올릴 수 있습니다.`;
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  // 붙여넣은 이미지는 이름에 확장자가 없을 수 있다. 확장자가 있으면 형식과 맞아야 한다.
  if (ext && !(EXT_OK[ext] ?? []).includes(file.type)) return `${file.name}: 확장자와 파일 형식이 다릅니다.`;
  if (file.size <= 0) return `${file.name}: 빈 파일입니다.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: 5MB를 넘습니다(${(file.size / 1024 / 1024).toFixed(1)}MB).`;
  return null;
}

/** 붙여넣은 이미지처럼 이름이 없거나 확장자가 없는 파일에 이름을 붙인다. */
export function fileNameFor(name: string, mime: string, index: number): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 120);
  if (clean && clean.includes('.')) return clean;
  return `${clean || `image-${index + 1}`}.${MIME_EXT[mime] ?? 'png'}`;
}

export function attachmentsOf(list: Attachment[], taskId: string, kind: AttachmentKind, resultRevision: number | null = null): Attachment[] {
  return list
    .filter((a) => a.taskId === taskId && a.kind === kind && (kind === 'request' || a.resultRevision === resultRevision))
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/** 순서를 한 칸 옮긴 목록. 바뀐 항목만 저장하면 된다. */
export function moved(items: Attachment[], id: string, delta: -1 | 1): Attachment[] {
  const i = items.findIndex((a) => a.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((a, k) => (a.position === k ? a : { ...a, position: k }));
}

export function totalBytes(list: Attachment[]): number {
  return list.reduce((sum, a) => sum + a.sizeBytes, 0);
}

/** GPT·PM·개발 AI 지시서에 넣는 첨부 목록. 이미지 내용은 추측하지 않고 사용자가 적은 역할·설명만 쓴다. */
export function describeAttachments(items: Attachment[]): string {
  if (items.length === 0) return '';
  return items
    .map((a, i) => `${i + 1}. [${ROLE_LABEL[a.role]}] ${a.fileName}${a.note ? ` — ${a.note}` : ''} (첨부 ${a.id.slice(0, 8)})`)
    .join('\n');
}

export async function sha256OfBytes(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 첨부를 추가·변경할 수 없는 이유(DB 트리거와 같은 규칙). 가능하면 null.
 * - 요청 자료: 최신 기획서가 A 승인되면 잠긴다(기획서를 새 버전으로 저장하면 다시 열린다).
 * - 결과 스크린샷: 최신 결과 패키지에만, B 승인 전까지, 추가만.
 */
export function attachmentBlocker(
  view: WorkflowView,
  kind: AttachmentKind,
  op: 'add' | 'change',
  count: number,
  resultRevision: number | null = null,
): string | null {
  if (kind === 'request') {
    if (view.aApproved) return 'A 승인 뒤에는 요청 자료를 바꿀 수 없습니다. 바꾸려면 기획서를 새 버전으로 저장하세요.';
    if (op === 'add' && count >= MAX_REQUEST_FILES) return `요청 자료는 ${MAX_REQUEST_FILES}장까지 올릴 수 있습니다.`;
    return null;
  }
  if (op === 'change') return '결과 스크린샷은 추가만 할 수 있습니다(검토 기록).';
  if (!view.result || resultRevision !== view.result.revision) return '최신 결과 패키지에만 스크린샷을 붙일 수 있습니다.';
  if (view.bApproved) return 'B 승인 뒤에는 결과를 바꿀 수 없습니다.';
  if (count >= MAX_RESULT_FILES) return `결과 스크린샷은 ${MAX_RESULT_FILES}장까지입니다.`;
  return null;
}
