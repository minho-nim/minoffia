import { useEffect, useState } from 'react';
import type { OfficeStore } from '../data/store';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';

/** 휴대폰 알림 켜기/끄기(v0.4.12). 기획서·계획·견본·결과가 오거나 막히면 알린다. */
export function PushToggle({ store }: { store: OfficeStore }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    pushState().then(
      (s) => {
        setState(s);
        // v0.7.35: 이 기기에서 알림이 켜져 있으면 열 때마다 서버에 다시 등록한다(서버가 구독을 잃으면 켜진 것처럼 보여도 알림이 안 왔다)
        if (s === 'on') void enablePush(store).catch(() => undefined);
      },
      () => setState('unsupported'),
    );
  }, []);
  // 안내 글은 잠깐만 보이고 사라진다(아이콘만 남게)
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(''), 4000);
    return () => window.clearTimeout(t);
  }, [note]);

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

  const on = state === 'on';
  const blocked = state === 'ios-install' || state === 'denied';
  const why = state === 'ios-install' ? '알림: 공유 → 홈 화면에 추가한 뒤 그 앱에서 켜요' : state === 'denied' ? '알림이 막혀 있어요(브라우저 설정에서 허용)' : '';
  const label = on ? '휴대폰 알림 켜짐 — 눌러서 끄기' : blocked ? why : '휴대폰 알림 꺼짐 — 눌러서 켜기';

  // 글자 대신 종 아이콘 하나(v0.4.87, 소유자): 켜짐 = 채운 종, 꺼짐·막힘 = 빗금 친 종. 이름·설명은 화면 읽기·길게 누르기용으로 남긴다.
  return (
    <span className="push-toggle">
      <button
        type="button"
        className={`push-icon${on ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
        disabled={busy}
        aria-label={label}
        aria-pressed={on}
        title={label}
        onClick={() => {
          if (blocked) return setNote(why);
          void (on ? run(() => disablePush(store), '알림을 껐어요') : run(() => enablePush(store), '알림을 켰어요'));
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          {!on && <path d="M3 3l18 18" />}
        </svg>
      </button>
      {note && (
        <span className="push-note" role="status">
          {note}
        </span>
      )}
    </span>
  );
}
