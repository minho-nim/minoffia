import type { ImageAnalysisBody } from '../../supabase/functions/analyze-image/analysis';
import type { WorkflowView } from './workflow';

/**
 * 첨부(v0.2 §4, §7, v0.3 01단계). 원본은 비공개 저장소에 두고, 화면에는 만료되는 주소로만 보여 준다.
 * 요청 자료는 이미지(5MB, SVG 포함)와 문서(20MB, HTML 포함), 결과 스크린샷은 PNG·JPG·WEBP·GIF만.
 * 규칙은 supabase/migrations/0004_attachments.sql, 0012_document_attachments.sql, 0013_html_svg_attachments.sql 과 같아야 한다.
 */

/** request = 업무 요청 자료(GPT·PM·개발 AI에 넘김), result = 결과 패키지의 스크린샷 */
export type AttachmentKind = 'request' | 'result';
export type AttachmentRole = 'current' | 'target' | 'error' | 'reference' | 'document' | 'before' | 'after';

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
  document: '문서·자료',
  before: '변경 전',
  after: '변경 후',
};

/** 이미지 역할(문서는 'document' 하나뿐) */
export const ROLES_FOR: Record<AttachmentKind, AttachmentRole[]> = {
  request: ['current', 'target', 'error', 'reference'],
  result: ['after', 'before'],
};

export const isImage = (mime: string) => mime.startsWith('image/');
/** 바로 <img>로 보여도 되는 그림(SVG는 저장소에서 글로 내려오므로 미리보기로만 본다) */
export const isRaster = (mime: string) => isImage(mime) && mime !== 'image/svg+xml';

/**
 * 저장소에 올릴 때 쓰는 형식. HTML·SVG는 비공개 주소를 새 탭에서 열어도 스크립트가 돌지 않도록 글(text/plain)로 저장한다.
 * DB에는 원래 형식을 남기고, 화면은 내려받아 격리된 미리보기로만 보여 준다.
 */
export const storageContentType = (mime: string) => (mime === 'text/html' || mime === 'image/svg+xml' ? 'text/plain' : mime);

/** 미리보기 방식 */
export type PreviewKind = 'image' | 'svg' | 'html' | 'text' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'zip';
export function previewKind(mime: string): PreviewKind | null {
  if (mime === 'image/svg+xml') return 'svg';
  if (isImage(mime)) return 'image';
  if (mime === 'text/html') return 'html';
  if (['text/plain', 'text/markdown', 'text/csv', 'application/json'].includes(mime)) return 'text';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/zip') return 'zip';
  const ext = MIME_EXT[mime];
  return ext === 'docx' || ext === 'xlsx' || ext === 'pptx' ? ext : null;
}

/** 이 파일에 고를 수 있는 역할 */
export const rolesFor = (kind: AttachmentKind, mime: string): AttachmentRole[] => (kind === 'request' && !isImage(mime) ? ['document'] : ROLES_FOR[kind]);

export const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'text/html': 'html',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
};

/**
 * 문서 확장자 → 저장할 형식. 브라우저·OS마다 같은 파일을 다른 형식 이름으로 주거나(예: Windows ZIP, CSV) 비워 주므로
 * 확장자로 정하고, 브라우저가 준 형식이 아래 별칭 중 하나(또는 빈 값)일 때만 받는다.
 */
const DOC_TYPES: Record<string, { mime: string; aliases: string[] }> = {
  pdf: { mime: 'application/pdf', aliases: [] },
  txt: { mime: 'text/plain', aliases: [] },
  md: { mime: 'text/markdown', aliases: ['text/x-markdown', 'text/plain'] },
  csv: { mime: 'text/csv', aliases: ['application/vnd.ms-excel', 'text/x-csv', 'application/csv', 'text/plain'] },
  json: { mime: 'application/json', aliases: ['text/json', 'text/plain'] },
  html: { mime: 'text/html', aliases: [] },
  htm: { mime: 'text/html', aliases: [] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', aliases: [] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', aliases: [] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', aliases: [] },
  zip: { mime: 'application/zip', aliases: ['application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip'] },
};

/** 파일 고르기 창에 줄 형식 목록 */
export const ACCEPT_REQUEST = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', '.svg', ...Object.keys(DOC_TYPES).map((e) => `.${e}`)].join(',');
export const ACCEPT_IMAGES = 'image/png,image/jpeg,image/webp,image/gif';

/** Gemini로 요약할 수 있는 문서(DOCX·XLSX·PPTX는 서버가 글을 뽑아 보낸다. ZIP·SVG는 미리보기만) */
const GEMINI_DOC_MIMES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
/** Gemini 요청 크기 한도 때문에 요약은 10MB 이하 문서만 */
export const MAX_GEMINI_DOC_BYTES = 10 * 1024 * 1024;
export const canGeminiRead = (a: { mime: string; sizeBytes: number }) =>
  isRaster(a.mime) || (GEMINI_DOC_MIMES.includes(a.mime) && a.sizeBytes <= MAX_GEMINI_DOC_BYTES);

/** 이미지 하나 5MB. Supabase 무료 저장소(1GB)를 아끼려고 둔 상한이다. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** 문서 하나 20MB */
export const MAX_DOC_BYTES = 20 * 1024 * 1024;
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

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** 문서면 저장할 형식(확장자 기준), 문서가 아니거나 형식이 맞지 않으면 null */
export function docMime(file: { name: string; type: string }): string | null {
  const t = DOC_TYPES[extOf(file.name)];
  if (!t) return null;
  return file.type === '' || file.type === t.mime || t.aliases.includes(file.type) ? t.mime : null;
}

/**
 * 받은 파일을 저장할 모양으로: 이름이 없으면 붙이고, 문서는 형식을 확장자 기준으로 맞춘다.
 * 이미지·문서가 아니면 그대로 돌려주고 validateFile이 거절한다.
 */
export function prepareFile(raw: File, index: number, allowDocs: boolean): File {
  const named = raw.name && raw.name.includes('.') ? raw : new File([raw], fileNameFor(raw.name, raw.type, index), { type: raw.type });
  if (!allowDocs || isRaster(named.type)) return named;
  // SVG는 형식 이름이 비어 오는 경우가 있다.
  if (/\.svg$/i.test(named.name) && (named.type === '' || named.type === 'image/svg+xml')) return named.type ? named : new File([named], named.name, { type: 'image/svg+xml' });
  const mime = docMime(named);
  return mime && mime !== named.type ? new File([named], named.name, { type: mime }) : named;
}

/** 문제가 있으면 한국어 이유, 없으면 null. allowDocs = 요청 자료(문서도 받음) */
export function validateFile(file: { name: string; type: string; size: number }, allowDocs = false): string | null {
  if (allowDocs && file.type === 'image/svg+xml') {
    if (!/\.svg$/i.test(file.name)) return `${file.name}: 확장자와 파일 형식이 다릅니다.`;
    if (file.size <= 0) return `${file.name}: 빈 파일입니다.`;
    if (file.size > MAX_FILE_BYTES) return `${file.name}: 5MB를 넘습니다(${(file.size / 1024 / 1024).toFixed(1)}MB).`;
    return null;
  }
  if (allowDocs && !isImage(file.type)) {
    if (!docMime(file)) return `${file.name}: 이미지(PNG·JPG·WEBP·GIF·SVG)나 문서(PDF·TXT·MD·CSV·JSON·HTML·DOCX·XLSX·PPTX·ZIP)만 올릴 수 있습니다.`;
    if (file.size <= 0) return `${file.name}: 빈 파일입니다.`;
    if (file.size > MAX_DOC_BYTES) return `${file.name}: 문서는 20MB까지입니다(${(file.size / 1024 / 1024).toFixed(1)}MB).`;
    return null;
  }
  if (!MIME_EXT[file.type] || !isRaster(file.type)) return `${file.name}: PNG·JPG·WEBP·GIF 이미지만 올릴 수 있습니다.`;
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

/** Gemini 이미지 분석 결과(서버만 만든다, 원본을 대신하지 않음) */
export interface ImageAnalysis {
  id: string;
  attachmentId: string;
  taskId: string;
  model: string;
  /** null = 같은 이미지의 이전 분석을 다시 씀 */
  keySlot: 1 | 2 | null;
  analysis: ImageAnalysisBody;
  createdAt: string;
}

/** ChatGPT 자료에 넣는 이미지 분석. 관찰과 추정을 나눠 그대로 옮긴다. */
export function describeAnalyses(items: Attachment[], analyses: ImageAnalysis[]): string {
  const byId = new Map(analyses.map((a) => [a.attachmentId, a]));
  return items
    .map((att, i) => {
      const a = byId.get(att.id);
      if (!a) return null;
      const b = a.analysis;
      const doc = !isImage(att.mime);
      const lines = [`${i + 1}. ${att.fileName} [${ROLE_LABEL[att.role]}]`];
      if (b.observations?.length) lines.push(`   ${doc ? '문서에 적힌 핵심' : '보이는 것'}: ${b.observations.join(' / ')}`);
      if (b.ui_structure) lines.push(`   ${doc ? '구성·요약' : '화면 구조'}: ${b.ui_structure}`);
      if (b.visible_text?.length) lines.push(`   ${doc ? '원문 인용' : '글자'}: ${b.visible_text.join(' / ')}`);
      if (b.colors_layout && !doc) lines.push(`   색·배치: ${b.colors_layout}`);
      if (b.role_fit) lines.push(`   ${doc ? '요청과의 관련' : '역할과 맞는지'}: ${b.role_fit}`);
      if (b.uncertainties?.length) lines.push(`   추정·불확실: ${b.uncertainties.join(' / ')}`);
      if (b.raw) lines.push(`   (형식 밖 답변) ${b.raw.slice(0, 1500)}`);
      return lines.join('\n');
    })
    .filter((x): x is string => x !== null)
    .join('\n');
}
