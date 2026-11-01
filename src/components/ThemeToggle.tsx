import { useState } from 'react';
import { loadTheme, nextTheme, saveTheme, THEME_LABEL, type ThemeChoice } from '../lib/theme';

/** 머리에 두는 화면 밝기 버튼. 누를 때마다 자동 → 밝게 → 어둡게 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(loadTheme);
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        const next = nextTheme(choice);
        saveTheme(next);
        setChoice(next);
      }}
      title="누를 때마다 자동 → 밝게 → 어둡게"
      aria-label={`${THEME_LABEL[choice]} (누르면 바꿈)`}
    >
      {THEME_LABEL[choice].replace('화면: ', '')}
    </button>
  );
}
