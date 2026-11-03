// 올리기 승인(B) 전 "되돌리기 쉬운가"(v0.5.21, 소유자 2026-11-03, mattpocock/skills의 pr 스킬 "merge danger" 아이디어).
// 결과 diff만 보고 규칙으로 판단한다(토큰 0). 한 방향 문(되돌리기 어려움) = 운영 데이터·배포 설정·서버가 바뀌는 것.
// 판단은 안내일 뿐 승인을 막지 않는다.

export interface MergeDanger {
  /** 되돌리기 어려움(한 방향 문) */
  oneWay: boolean;
  /** 어려운 이유(파일·패턴), 최대 4개 */
  reasons: string[];
  files: number;
  /** 바뀐 맨 위 폴더 수(영향 범위) */
  areas: number;
}

const ONE_WAY_FILES: [RegExp, string][] = [
  [/(^|\/)migrations?\/|\.sql$/i, 'DB 변경'],
  [/^\.github\/workflows\//, '배포·CI 설정'],
  [/(^|\/)supabase\/functions\//, '서버 함수'],
  [/(^|\/)(wrangler\.toml|vercel\.json|netlify\.toml|_headers|_redirects)$/, '배포 설정'],
  [/(^|\/)(\.env[^/]*|.*secrets?[^/]*)$/i, '비밀값 파일'],
];

const ONE_WAY_LINES: [RegExp, string][] = [
  [/\b(drop\s+(table|column|schema)|truncate\s+table|delete\s+from)\b/i, '데이터 삭제 SQL'],
  [/\brm\s+-rf\b/, '파일 지우기 명령'],
  [/\b(localStorage|indexedDB)\.(clear|removeItem)|\bdeleteDatabase\(/, '저장된 데이터 지우기'],
];

/** diff 머리 줄(diff --git a/x b/x)에서 바뀐 파일 경로 */
export function diffFiles(diff: string): string[] {
  return [...new Set([...diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map((m) => m[2]))];
}

export function mergeDanger(diff: string): MergeDanger {
  const files = diffFiles(diff);
  const reasons = new Set<string>();
  for (const f of files) for (const [re, label] of ONE_WAY_FILES) if (re.test(f)) reasons.add(label);
  const added = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');
  for (const [re, label] of ONE_WAY_LINES) if (re.test(added)) reasons.add(label);
  const areas = new Set(files.map((f) => (f.includes('/') ? f.slice(0, f.indexOf('/')) : '.'))).size;
  return { oneWay: reasons.size > 0, reasons: [...reasons].slice(0, 4), files: files.length, areas };
}
