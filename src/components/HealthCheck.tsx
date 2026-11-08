// 앱 건강 검진·기본 지도(floorplan 1단계, v0.5.53, 소유자 목록 28번): 프로젝트 카드에서 검진을 시작하고 결과를 쉬운 한국어로 본다.
// 검진은 GitHub Actions가 AI 없이 돌린다(2~5분). 지도는 floorplan이 만든 HTML이라 앱과 분리된 창(sandbox, 같은 출처 권한 없음)에서만 연다.
import { useEffect, useRef, useState } from 'react';
import { koIssue, type HealthReport } from '../domain/healthText';

export type HealthApi = {
  load: () => Promise<HealthReport | null>;
  start: () => Promise<void>;
  map: () => Promise<string | null>;
};

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function HealthCheck({ api }: { api: HealthApi }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [state, setState] = useState<'loading' | 'idle' | 'checking' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [mapHtml, setMapHtml] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    api.load().then((r) => {
      setReport(r);
      setState('idle');
    }, () => setState('idle'));
    return () => void (timer.current && window.clearTimeout(timer.current));
  }, []);

  const poll = (since: number, tries = 0) => {
    timer.current = window.setTimeout(async () => {
      const r = await api.load().catch(() => null);
      if (r && new Date(r.checkedAt).getTime() >= since) {
        setReport(r);
        setState('idle');
      } else if (tries < 32) poll(since, tries + 1);
      else {
        setState('error');
        setMsg('8분이 지나도 결과가 오지 않았어요. 잠시 뒤 다시 눌러 주세요.');
      }
    }, 15_000);
  };

  const start = async () => {
    setState('checking');
    setMsg('');
    const since = Date.now() - 60_000;
    try {
      await api.start();
      setReport(null);
      poll(since);
    } catch (e) {
      setState('error');
      setMsg((e as Error).message || '검진을 시작하지 못했어요.');
    }
  };

  const openMap = async () => {
    try {
      const html = await api.map();
      if (html) setMapHtml(html);
      else setMsg('지도가 아직 없어요. 검진을 먼저 해 주세요.');
    } catch (e) {
      setMsg((e as Error).message || '지도를 열지 못했어요.');
    }
  };

  if (state === 'loading') return <p className="muted small">불러오는 중…</p>;
  return (
    <div className="health">
      {report ? (
        <>
          <p className="small">
            {when(report.checkedAt)} 검진 · <b className={report.summary.high ? 'health-high' : ''}>중요 {report.summary.high}</b> · 고칠 만함 {report.summary.medium} · 사소 {report.summary.low}
            {report.files ? <span className="muted"> · 코드 {report.files}개</span> : null}
          </p>
          {report.issues.length === 0 ? (
            <p className="muted small">걱정할 문제가 없어요.</p>
          ) : (
            <ul className="health-list">
              {report.issues.map((i, n) => {
                const k = koIssue(i);
                return (
                  <li key={`${i.kind}-${n}`}>
                    <span className={`pill health-${i.severity}`}>{k.severity}</span> <b>{k.title}</b>
                    <p className="muted small">{k.detail}</p>
                    {i.items.length > 0 && <p className="small health-items">{i.items.slice(0, 5).join(', ')}{i.items.length > 5 ? ` 외 ${i.items.length - 5}개` : ''}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        state !== 'checking' && <p className="muted small">아직 검진한 적이 없어요. 비밀 열쇠 노출·아무나 부를 수 있는 서버 주소·DB 규칙 실수·안 쓰는 파일 등을 AI 없이 찾아요.</p>
      )}
      <div className="health-actions">
        <button type="button" className="btn btn-small" disabled={state === 'checking'} onClick={() => void start()}>
          {state === 'checking' ? '검진 중… (2~5분)' : report ? '다시 검진' : '건강 검진 하기'}
        </button>
        {report && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => void openMap()}>
            앱 지도 보기
          </button>
        )}
      </div>
      {msg && <p className="task-error small">{msg}</p>}
      {mapHtml && (
        <div className="archify-modal" role="dialog" aria-label="앱 지도" onClick={() => setMapHtml(null)}>
          <div className="archify-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="archify-close" onClick={() => setMapHtml(null)} aria-label="닫기">
              ×
            </button>
            <iframe className="archify-frame" sandbox="allow-scripts" srcDoc={mapHtml} title="앱 지도(floorplan)" />
          </div>
        </div>
      )}
    </div>
  );
}
