// 노트 경로 검사(v0.8.5): 자동 노트가 들어갈 자리만 허락한다. '내 메모/'·숨김 폴더·위로 올라가기·.md 아닌 파일은 거절.
export const MAX_FILES = 300;
export const MAX_FILE = 200_000;
export const MAX_TOTAL = 3_000_000;

const SEG = /^[^\\/:*?"<>|#^[\]\u0000-\u001f]{1,80}$/;

export function okPath(p: string): boolean {
  if (typeof p !== 'string' || p.length > 300) return false;
  // 옵시디언 Bases 표(.base)는 대시보드/ 아래에만(v0.8.7)
  if (p.endsWith('.base')) return /^대시보드\/[^/]{1,60}\.base$/.test(p) && !p.includes('..');
  if (!p.endsWith('.md')) return false;
  const parts = p.split('/');
  if (parts.some((s) => !SEG.test(s) || s.startsWith('.') || s.trim() !== s || s === '..')) return false;
  if (parts[0] === '내 메모') return false;
  // 허락한 자리: 채팅/·데일리/·자료/ 아래, 또는 <프로젝트>/업무/·<프로젝트>/채팅/·<프로젝트>/위키.md
  if (['채팅', '데일리', '자료', '대시보드', '결정', '주간', '아이디어', '대화', '스킬'].includes(parts[0]) && parts.length === 2) return true;
  if (parts[0] === '스킬' && parts[1] === '분류' && parts.length === 3) return true;
  if (parts.length === 3 && (parts[1] === '업무' || parts[1] === '채팅' || parts[1] === '대화')) return true;
  if (parts.length === 2 && (parts[1] === '위키.md' || parts[1] === '업무 목록.md' || parts[1] === '지식.md')) return true;
  return false;
}

export function checkFiles(files: unknown): { path: string; content: string }[] | string {
  if (!Array.isArray(files) || !files.length) return '보낼 노트가 없습니다.';
  if (files.length > MAX_FILES) return `노트는 한 번에 ${MAX_FILES}개까지입니다.`;
  let total = 0;
  const out: { path: string; content: string }[] = [];
  const seen = new Set<string>();
  for (const f of files as { path?: unknown; content?: unknown }[]) {
    const path = String(f?.path ?? '');
    const content = typeof f?.content === 'string' ? f.content : null;
    if (!okPath(path) || content === null) return `허락하지 않은 노트 경로입니다: ${path.slice(0, 80)}`;
    if (content.length > MAX_FILE) return `노트가 너무 깁니다: ${path.slice(0, 80)}`;
    if (seen.has(path)) continue;
    seen.add(path);
    total += content.length;
    out.push({ path, content });
  }
  if (total > MAX_TOTAL) return '노트가 너무 많습니다. 나눠서 보내 주세요.';
  return out;
}
