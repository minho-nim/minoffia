import { useEffect, useRef, useState } from 'react';
import type { MyTurn } from '../domain/myTurn';

/**
 * 머리의 내 차례 숫자(v0.4.30). 큰 머리·얇은 머리 모두 버전 옆 같은 자리에 같은 모양으로 둔다.
 * 누르면 내 차례 업무 목록이 펼쳐지고, 업무를 누르면 업무 탭의 그 카드로 간다.
 */
export function TurnMenu({ items, onOpen, tabbable = true }: { items: MyTurn[]; onOpen: (taskId: string) => void; tabbable?: boolean }) {
  const [open, setOpen] = useState(false);
  // 목록은 화면 기준으로 띄우고, 숫자 바로 아래에서 화면 안에 들어오게 왼쪽 위치를 맞춘다.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(360, window.innerWidth - 32);
    setPos({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)), width });
  };
  useEffect(() => {
    if (!open) return;
    const shut = () => setOpen(false);
    window.addEventListener('scroll', shut, { passive: true });
    window.addEventListener('resize', shut);
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', shut);
      window.removeEventListener('resize', shut);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <span className="turn-menu" ref={ref}>
      <button
        type="button"
        className="num num-turn turn-menu-btn"
        aria-expanded={open}
        aria-label={`내 차례 ${items.length}개 보기`}
        title="내 차례 업무 보기"
        tabIndex={tabbable ? 0 : -1}
        onClick={() => {
          if (!open) place();
          setOpen((o) => !o);
        }}
      >
        {items.length}
      </button>
      {open && pos && (
        <ul className="turn-menu-list" role="menu" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {items.map((m) => (
            <li key={`${m.taskId}:${m.word}`} role="none">
              <button
                type="button"
                role="menuitem"
                className={m.alert ? 'is-alert' : undefined}
                onClick={() => {
                  setOpen(false);
                  onOpen(m.taskId);
                }}
              >
                <span className="turn-menu-mark">
                  {m.word}[{m.alert ? '!' : '?'}]
                </span>
                <span className="turn-menu-text">
                  <b>{m.title}</b>
                  <span>{m.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
