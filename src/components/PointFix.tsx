import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pointNotesText, whereText, type Pin } from '../domain/pointNotes';

/**
 * 화면 짚어서 수정 요청(v0.5.48): 스크린샷을 누르면 번호 표시가 찍히고, 번호마다 고칠 점을 적는다.
 * '수정 요청에 넣기'를 누르면 위치를 말로 바꾼 글을 수정 요청 칸에 붙인다(보내기는 원래 버튼으로).
 */
export function PointFix({ src, name, what, onDone, onClose }: { src: string; name: string; what?: string; onDone: (text: string) => void; onClose: () => void }) {
  const [pins, setPins] = useState<Pin[]>([]);
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
  const text = pointNotesText(name, pins, what);
  return createPortal(
    <div className="point-fix" role="dialog" aria-modal="true" aria-label={`${name} 짚어서 수정`}>
      <div className="point-fix-box">
        <p className="small">
          <b>화면 짚어서 수정</b> — 고칠 곳을 누르고 번호마다 고칠 점을 적으세요.
        </p>
        <div
          className="point-fix-img"
          onClick={(e) => {
            if (pins.length >= 9) return;
            const r = e.currentTarget.getBoundingClientRect();
            const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
            const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
            setPins((p) => [...p, { x, y, note: '' }]);
          }}
        >
          <img src={src} alt={name} draggable={false} />
          {pins.map((p, i) => (
            <span key={i} className="point-pin" style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-hidden="true">
              {i + 1}
            </span>
          ))}
        </div>
        {pins.length === 0 ? (
          <p className="muted small">아직 표시가 없어요. 사진에서 고칠 곳을 눌러 보세요(최대 9곳).</p>
        ) : (
          <ol className="point-list">
            {pins.map((p, i) => (
              <li key={i}>
                <span className="point-num">{i + 1}</span>
                <input
                  aria-label={`${i + 1}번 고칠 점`}
                  placeholder={`${whereText(p.x, p.y)}: 고칠 점`}
                  value={p.note}
                  maxLength={300}
                  autoFocus={i === pins.length - 1}
                  onChange={(e) => setPins((all) => all.map((q, j) => (j === i ? { ...q, note: e.target.value } : q)))}
                />
                <button type="button" className="link-btn small" aria-label={`${i + 1}번 빼기`} onClick={() => setPins((all) => all.filter((_, j) => j !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="point-actions">
          <button type="button" className="btn btn-small" disabled={!text} onClick={() => onDone(text)}>
            수정 요청에 넣기
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
