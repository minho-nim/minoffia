// 화면 밝기(v0.4.27): 자동(기기 설정) · 밝게 · 어둡게. 이 기기에만 기억한다.
// styles.css의 :root[data-theme='light'|'dark']와 prefers-color-scheme이 실제 색을 정한다.
export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'minlab-ai-office:theme:v1';

export function loadTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function saveTheme(choice: ThemeChoice) {
  applyTheme(choice);
  try {
    if (choice === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에서만
  }
}

/** 누를 때마다 자동 → 밝게 → 어둡게 → 자동 */
export const nextTheme = (c: ThemeChoice): ThemeChoice => (c === 'auto' ? 'light' : c === 'light' ? 'dark' : 'auto');

export const THEME_LABEL: Record<ThemeChoice, string> = { auto: '화면: 자동', light: '화면: 밝게', dark: '화면: 어둡게' };
