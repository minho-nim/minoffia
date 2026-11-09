// 앱 점검·기본 지도(floorplan 1단계, v0.5.53, 소유자 목록 28번): 프로젝트 카드에서 점검을 시작하고 결과를 쉬운 한국어로 본다.
// 점검은 GitHub Actions가 AI 없이 돌린다(2~5분). 지도는 floorplan이 만든 HTML이라 앱과 분리된 창(sandbox, 같은 출처 권한 없음)에서만 연다.
import { useEffect, useRef, useState } from 'react';
import { APP_MAP_KINDS, koIssue, type AppMap, type HealthReport } from '../domain/healthText';

export type HealthApi = {
  load: () => Promise<HealthReport | null>;
  start: () => Promise<void>;
  map: () => Promise<string | null>;
};

/** 쉬운 앱 지도(v0.5.94): 화면·기능·서버·데이터·설정 순서로 카드. 파일 이름은 눌러야 보인다(코딩 안 하는 사람 기준) */
export function AppMapView({ map }: { map: AppMap }) {
  return (
    <div className="appmap">
      {map.summary && <p className="appmap-summary">{map.summary}</p>}
      {APP_MAP_KINDS.map((kind) => {
        const parts = map.parts.filter((p) => p.kind === kind);
        if (!parts.length) return null;
        return (
          <section key={kind} className="appmap-group">
            <h4 className="appmap-kind">
              {kind} <span className="muted small">{parts.length}</span>
            </h4>
            <ul className="appmap-list">
              {parts.map((p) => (
                <li key={`${p.name}-${p.folder}`} className="appmap-card">
                  <b>{p.name}</b>
                  <span className="appmap-what">{p.what}</span>
                  {(p.folder || p.files.length > 0) && (
                    <details className="appmap-files">
                      <summary>파일 위치</summary>
                      {p.folder && <code>{p.folder}/</code>}
                      {p.files.map((f) => (
                        <code key={f}>{f}</code>
                      ))}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {map.by === 'rule' && <p className="muted small">AI 설명 없이 폴더로만 나눈 지도예요. 다시 점검하면 쉬운 설명이 붙어요.</p>}
    </div>
  );
}

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
      setMsg((e as Error).message || '점검을 시작하지 못했어요.');
    }
  };

  // 자세한 지도(floorplan)는 '자세히'를 처음 누를 때 한 번만 받는다
  // 지도는 둘 다 팝업으로(v0.5.96 소유자 "둘 다 팝업으로")
  const [popup, setPopup] = useState<'brief' | 'detail' | null>(null);
  const showDetail = async () => {
    setPopup('detail');
    if (mapHtml) return;
    try {
      const html = await api.map();
      if (html) setMapHtml(html);
      else setMsg('자세한 지도가 아직 없어요. 점검을 먼저 해 주세요.');
    } catch (e) {
      setMsg((e as Error).message || '지도를 열지 못했어요.');
    }
  };

  if (state === 'loading') return <p className="muted small">불러오는 중…</p>;
  const issues = report?.issues ?? [];
  return (
    <div className="health">
      {/* 1. 점검: 마지막 점검 한 줄 + 버튼, 문제 목록은 접어 둔다(v0.5.96 소유자 "점검 버튼, 간략 지도, 자세한 지도") */}
      <div className="health-head">
        <span className="small">
          {report ? (
            <>
              {when(report.checkedAt)} 점검 · <b className={report.summary.high ? 'health-high' : ''}>중요 {report.summary.high}</b> · 고칠 만함 {report.summary.medium} · 사소 {report.summary.low}
            </>
          ) : state === 'checking' ? (
            '점검하고 지도를 만드는 중이에요.'
          ) : (
            '아직 점검한 적이 없어요.'
          )}
        </span>
      </div>
      {!report && state !== 'checking' && <p className="muted small">점검하면 앱이 어떤 화면·기능으로 되어 있는지 지도를 만들고, 비밀 열쇠 노출·DB 규칙 실수·안 쓰는 파일 등도 찾아요(AI 없이, 2~5분).</p>}
      {report &&
        (issues.length ? (
          <details className="health-issues">
            <summary>점검 결과 보기 ({issues.length}개)</summary>
            <ul className="health-list">
              {issues.map((i, n) => {
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
          </details>
        ) : (
          <p className="muted small">걱정할 문제가 없어요.</p>
        ))}

      {/* 2. 앱 지도: 간략 지도(쉬운 카드) / 자세한 지도(floorplan 원본), 둘 다 팝업 */}
      <div className="map-buttons">
        {report && (
          <>
          <button type="button" className="btn btn-small btn-primary" onClick={() => setPopup('brief')}>
            간략 지도
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => void showDetail()}>
            자세한 지도
          </button>
          </>
        )}
        <button type="button" className="btn btn-small btn-ghost map-recheck" disabled={state === 'checking'} onClick={() => void start()}>
          {state === 'checking' ? '점검 중… (2~5분)' : report ? '다시 점검' : '점검하기'}
        </button>
      </div>
      {msg && <p className="task-error small">{msg}</p>}
      {popup && (
        <div className="archify-modal" role="dialog" aria-label={popup === 'brief' ? '간략 지도' : '자세한 지도'} onClick={() => setPopup(null)}>
          <div className={`archify-box${popup === 'brief' ? ' map-brief-box' : ''}`} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="archify-close" onClick={() => setPopup(null)} aria-label="닫기">
              ×
            </button>
            {popup === 'brief' ? (
              <div className="map-brief">
                <p className="appmap-title">간략 지도</p>
                {report?.appMap ? <AppMapView map={report.appMap} /> : <p className="muted small">{report?.files === 0 ? '코드 파일이 없는 저장소라 지도를 만들 수 없어요.' : "간략 지도는 다음 점검 때 만들어져요. '다시 점검'을 눌러 주세요."}</p>}
              </div>
            ) : mapHtml ? (
              <iframe className="archify-frame" sandbox="allow-scripts" srcDoc={mapHtml} title="자세한 앱 지도(floorplan)" />
            ) : (
              <p className="muted small map-brief">{msg || '자세한 지도를 불러오는 중…'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
