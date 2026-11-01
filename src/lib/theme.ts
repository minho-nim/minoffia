// 화면 밝기(v0.4.27, v0.4.50 소유자: 밝게·어둡게 두 가지만, 기본은 밝게). 이 기기에만 기억한다.
// styles.css의 :root[data-theme='light'|'dark']가 실제 색을 정한다. 늘 data-theme를 달아 기기 다크 설정은 따르지 않는다.
export type ThemeChoice = 'light' | 'dark';

const KEY = 'minlab-ai-office:theme:v1';

export function loadTheme(): ThemeChoice {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(choice: ThemeChoice) {
  document.documentElement.dataset.theme = choice;
}

/** 큰 머리·얇은 머리의 버튼이 같은 값을 보이도록 바꿀 때 알린다 */
export const THEME_EVENT = 'minlab-theme';

export function saveTheme(choice: ThemeChoice) {
  applyTheme(choice);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: choice }));
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에서만
  }
}

/** 누를 때마다 밝게 ↔ 어둡게 */
export const nextTheme = (c: ThemeChoice): ThemeChoice => (c === 'light' ? 'dark' : 'light');

export const THEME_LABEL: Record<ThemeChoice, string> = { light: '화면: 밝게', dark: '화면: 어둡게' };
