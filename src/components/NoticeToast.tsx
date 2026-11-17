// 앱 안 알림(초록=됨, 빨강=오류)을 탭 줄(대화~설정) 바로 아래에 살짝 뜨는 팝업으로(v0.7.47 소유자 "대화~설정탭 아래에 살짝 팝업, x 버튼, 노출시간은 지금과 동일").
// 노출 시간은 그대로: 초록은 4초 뒤 사라지고, 빨강은 이유를 읽도록 닫을 때까지 남는다(App의 say).
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function NoticeToast({ kind, text, onClose }: { kind: 'ok' | 'error'; text: string; onClose: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    // 탭 줄의 실제 아래쪽(고정 여부·두 줄 탭·휴대폰 상단 영역과 상관없이)에 붙인다. 탭이 화면 밖이면 화면 맨 위
    const place = () => {
      const r = document.querySelector('nav.tabs')?.getBoundingClientRect();
      if (r) setPos({ top: Math.max(r.bottom, 0) + 6, left: r.left + r.width / 2, width: r.width });
    };
    place();
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [text]);
  return createPortal(
    <div
      className={`notice notice-${kind} notice-toast`}
      role={kind === 'error' ? 'alert' : 'status'}
      style={pos ? { top: pos.top, left: pos.left, width: `min(560px, ${Math.max(0, pos.width - 16)}px)` } : undefined}
    >
      <span>{text}</span>
      <button type="button" className="notice-close" onClick={onClose} aria-label="알림 닫기">
        ✕
      </button>
    </div>,
    document.body,
  );
}
