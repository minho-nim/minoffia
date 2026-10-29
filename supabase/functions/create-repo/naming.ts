// 새 GitHub 저장소 이름 규칙(외부 의존 없음: Deno 함수와 화면이 같이 쓴다).

/** AI Office가 절대 만들거나 건드리지 않는 저장소 이름(소유자 지시: minho-nim/MinLab 금지) */
export const FORBIDDEN_NAMES = ['minlab'];

/** 프로젝트 이름으로 저장소 이름 후보를 만든다. 영문·숫자가 없으면 빈 문자열(사용자가 직접 적는다). */
export function toRepoSlug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
}

/** 문제가 있으면 한국어 이유, 없으면 null */
export function repoNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return '저장소 이름을 적으세요(영문·숫자·-·_·.).';
  if (n.length > 100) return '저장소 이름은 100자까지입니다.';
  if (!/^[A-Za-z0-9._-]+$/.test(n)) return '저장소 이름에는 영문·숫자·-·_·.만 쓸 수 있습니다.';
  if (n === '.' || n === '..' || /\.git$/i.test(n)) return '쓸 수 없는 저장소 이름입니다.';
  if (FORBIDDEN_NAMES.includes(n.toLowerCase())) return `'${n}'은(는) 보호된 저장소 이름이라 만들지 않습니다.`;
  return null;
}
