import { useEffect, useState } from 'react';
import { loadTheme, nextTheme, saveTheme, THEME_EVENT, THEME_LABEL, type ThemeChoice } from '../lib/theme';

/** 머리에 두는 화면 밝기 버튼. 누를 때마다 밝게 ↔ 어둡게. 큰 머리·얇은 머리 두 곳이 같은 값을 보인다 */
export function ThemeToggle({ tabbable = true }: { tabbable?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>(loadTheme);
  useEffect(() => {
    const sync = (e: Event) => setChoice((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);
  return (
    <button
      type="button"
      className="theme-toggle"
      tabIndex={tabbable ? 0 : -1}
      onClick={() => {
        const next = nextTheme(choice);
        saveTheme(next);
        setChoice(next);
      }}
      title="누를 때마다 밝게 ↔ 어둡게"
      aria-label={`${THEME_LABEL[choice]} (누르면 바꿈)`}
    >
      {THEME_LABEL[choice].replace('화면: ', '')}
    </button>
  );
}
