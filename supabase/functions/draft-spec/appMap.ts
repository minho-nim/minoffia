// 개발 지시서에 붙이는 앱 지도(v0.5.95, 소유자 "앱 지도를 AI가 참고하게 연결"): 점검 때 만든 쉬운 지도에서
// '어느 화면·기능이 어느 폴더에 있는지'만 짧게(최대 2,000자) 붙여 개발 AI가 고칠 파일을 바로 찾게 한다. 모델 호출 없음.
// 서버 복사본: supabase/functions/dispatch-gemini-dev/appMap.ts, dispatch-claude-dev/appMap.ts(같은지 시험이 확인)
const MAX = 2000;

export function appMapSection(raw: unknown): string {
  const m = raw as { parts?: unknown } | null;
  if (!m || typeof m !== 'object' || !Array.isArray(m.parts)) return '';
  const s = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const lines: string[] = [];
  let size = 0;
  for (const p of m.parts as Record<string, unknown>[]) {
    if (!p || typeof p !== 'object') continue;
    const name = s(p.name, 40);
    const where = s(p.folder, 120) ? `${s(p.folder, 120)}/` : s(Array.isArray(p.files) ? p.files[0] : '', 160);
    if (!name || !where) continue;
    const line = `- [${s(p.kind, 6) || '기능'}] ${name}: ${s(p.what, 100)} → ${where}`;
    if (size + line.length > MAX) break;
    lines.push(line);
    size += line.length + 1;
  }
  if (!lines.length) return '';
  return ['## 앱 지도(어디에 무엇이 있는지, 최근 점검 기준)', '고칠 곳을 찾을 때 먼저 참고한다. 지도와 실제 코드가 다르면 코드를 따른다.', ...lines].join('\n');
}
