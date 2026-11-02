import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * 사진 크게 보기 팝업(v0.4.89 대화창, v0.4.91 업무 카드 첨부까지). 화면 전체를 덮도록 body에 그린다.
 * 아무 곳이나 누르거나 Esc로 닫는다. 새 탭으로 나가지 않는다(휴대폰 앱에서 브라우저로 튕기지 않게).
 */
export function ImageZoom({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  return createPortal(
    <div className="inbox-zoom" role="dialog" aria-modal="true" aria-label={`${name} 크게 보기`} onClick={onClose}>
      <img src={src} alt={name} />
      <span className="inbox-zoom-name">{name} · 아무 곳이나 누르면 닫혀요</span>
    </div>,
    document.body,
  );
}
