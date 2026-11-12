// 입력 팝업(v0.6.72 소유자 "새 프로젝트 등록, 직접 입력은 팝업창으로"): 가운데 창, ✕·바깥 누르기·Esc로 닫고 열린 동안 뒤 화면은 안 밀린다.
import { useEffect, type ReactNode } from 'react';

/** wide = 지도처럼 넓고 높게(안쪽 여백 없이) */
export function FormPopup({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = before;
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <div className="form-pop" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`form-pop-box${wide ? ' is-wide' : ''}`}>
        <div className="form-pop-head">
          <b>{title}</b>
          <button type="button" className="form-pop-close" onClick={onClose} aria-label="닫기">
            ✕ 닫기
          </button>
        </div>
        <div className="form-pop-body">{children}</div>
      </div>
    </div>
  );
}
