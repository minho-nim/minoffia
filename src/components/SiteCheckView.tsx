// 화면 확인(v0.6.9, 소유자 "승인 전 중간에서 보는 건?"): 실제 미리보기·운영 사이트를 찍은 사진과 판정 한 줄.
// 승인 전(preview)은 '지금 운영 / 바뀐 미리보기'를 나란히, 배포 뒤(production)는 '배포 뒤 운영'. 사진은 누르면 크게.
import { useEffect, useRef, useState } from 'react';
import { TARGET_LABEL, verdictLine, type SiteCheck, type SiteChecks, type SiteKind } from '../domain/siteCheck';
import { ImageZoom } from './ImageZoom';

export type SiteCheckApi = { load: () => Promise<SiteChecks>; start: (kind: SiteKind) => Promise<void> };

export function SiteCheckView({ api, kind, canStart }: { api: SiteCheckApi; kind: SiteKind; canStart: boolean }) {
  const [check, setCheck] = useState<SiteCheck | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [zoom, setZoom] = useState<{ src: string; name: string } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    api.load().then((c) => setCheck(c[kind] ?? null), () => undefined);
    return () => void (timer.current && window.clearTimeout(timer.current));
  }, [kind]);
  const poll = (since: number, tries = 0) => {
    timer.current = window.setTimeout(async () => {
      const c = (await api.load().catch(() => ({}) as SiteChecks))[kind];
      if (c && new Date(c.result.checkedAt).getTime() >= since) {
        setCheck(c);
        setState('idle');
      } else if (tries < 48) poll(since, tries + 1);
      else {
        setState('error');
        setMsg('12분이 지나도 결과가 오지 않았어요. 사이트가 아직 안 떴을 수 있어요. 잠시 뒤 다시 눌러 주세요.');
      }
    }, 15_000);
  };
  const start = async () => {
    setState('checking');
    setMsg('');
    try {
      await api.start(kind);
      poll(Date.now() - 60_000);
    } catch (e) {
      setState('error');
      setMsg((e as Error).message || '화면 확인을 시작하지 못했어요.');
    }
  };
  const v = check ? verdictLine(check) : null;
  return (
    <div className="site-check">
      <p className="small">
        <b>{kind === 'preview' ? '화면 확인(승인 전)' : kind === 'build' ? '결과 화면(미노가 빌드해서 찍음)' : '화면 확인(배포 뒤)'}</b>{' '}
        {v ? <span className={v.ok ? 'ok-text' : 'task-error'}>{v.ok ? '✓ ' : '! '}{v.text}</span> : <span className="muted">{state === 'checking' ? '실제 사이트를 여는 중… (사이트가 뜨기까지 몇 분 걸릴 수 있어요)' : '아직 안 했어요.'}</span>}
      </p>
      {check && (
        <div className="site-shots">
          {check.result.targets.map((t) => (
            <figure key={t.key}>
              <figcaption className="muted small">
                {kind === 'build' && t.key === 'after' ? '바뀐 결과' : TARGET_LABEL[t.key]}{' '}
                {/^https:\/\//.test(t.url) && (
                  <a href={t.url} target="_blank" rel="noopener noreferrer">
                    열기 ↗
                  </a>
                )}
              </figcaption>
              <span className="site-shot-row">
                {t.shots.map((s) =>
                  check.images[s.file] ? (
                    <button key={s.file} type="button" className="site-shot" onClick={() => setZoom({ src: check.images[s.file], name: `${TARGET_LABEL[t.key]} ${s.size === 'pc' ? 'PC' : '휴대폰'}` })}>
                      <img src={check.images[s.file]} alt={`${TARGET_LABEL[t.key]} ${s.size === 'pc' ? 'PC' : '휴대폰'} 화면`} loading="lazy" />
                      <span className="muted small">{s.size === 'pc' ? 'PC' : '휴대폰'}{s.errorCount ? ` · 오류 ${s.errorCount}` : ''}{s.overflow ? ' · 넘침' : ''}</span>
                    </button>
                  ) : null,
                )}
                {!t.shots.length && <span className="muted small">{t.note || `열지 못함(HTTP ${t.status || '응답 없음'})`}</span>}
              </span>
            </figure>
          ))}
        </div>
      )}
      {canStart && (
        <button type="button" className="link-btn small" disabled={state === 'checking'} onClick={() => void start()}>
          {state === 'checking' ? '확인 중…' : check ? '다시 확인' : '지금 확인'}
        </button>
      )}
      {msg && <p className="task-error small">{msg}</p>}
      {zoom && <ImageZoom src={zoom.src} name={zoom.name} onClose={() => setZoom(null)} />}
    </div>
  );
}
