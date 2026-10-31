import { useEffect, useState } from 'react';
import type { OfficeStore } from '../data/store';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';

/** 휴대폰 알림 켜기/끄기(v0.4.12). 기획서·계획·견본·결과가 오거나 막히면 알린다. */
export function PushToggle({ store }: { store: OfficeStore }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    pushState().then(setState, () => setState('unsupported'));
  }, []);

  if (!state || state === 'unsupported') return null;

  const run = async (fn: () => Promise<PushState | void>, ok?: string) => {
    setBusy(true);
    setNote('');
    try {
      const s = await fn();
      if (s) setState(s);
      if (ok) setNote(ok);
    } catch (e) {
      setNote(e instanceof Error ? e.message : '알림 설정에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="push-toggle">
      {state === 'ios-install' && <span className="push-note">알림: 공유 → 홈 화면에 추가 뒤 그 앱에서 켜요</span>}
      {state === 'denied' && <span className="push-note">알림이 막혀 있어요(브라우저 설정에서 허용)</span>}
      {state === 'off' && (
        <button type="button" className="link-btn" disabled={busy} onClick={() => void run(() => enablePush(store), '알림을 켰어요')}>
          휴대폰 알림 켜기
        </button>
      )}
      {state === 'on' && (
        <>
          <button type="button" className="link-btn" disabled={busy} onClick={() => void run(async () => void (await store.push('test')), '시험 알림을 보냈어요')}>
            알림 시험
          </button>
          <button type="button" className="link-btn" disabled={busy} onClick={() => void run(() => disablePush(store), '알림을 껐어요')}>
            알림 끄기
          </button>
        </>
      )}
      {note && <span className="push-note" role="status">{note}</span>}
    </span>
  );
}
