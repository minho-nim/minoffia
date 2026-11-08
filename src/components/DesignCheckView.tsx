// 디자인 자동 검사(v0.5.56, 소유자 목록 26번): 결과 미리보기를 GitHub Actions가 AI 없이 검사하고(2~4분), 결과를 쉬운 한국어로 묶어 보여 준다.
import { useEffect, useRef, useState } from 'react';
import { groupFindings, type DesignReport } from '../domain/designCheck';

export type DesignCheckApi = { load: () => Promise<DesignReport | null>; start: () => Promise<void> };

export function DesignCheckView({ api }: { api: DesignCheckApi }) {
  const [report, setReport] = useState<DesignReport | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const timer = useRef<number | null>(null);
  useEffect(() => {
    api.load().then(setReport, () => undefined);
    return () => void (timer.current && window.clearTimeout(timer.current));
  }, []);
  const poll = (since: number, tries = 0) => {
    timer.current = window.setTimeout(async () => {
      const r = await api.load().catch(() => null);
      if (r && new Date(r.checkedAt).getTime() >= since) {
        setReport(r);
        setState('idle');
      } else if (tries < 28) poll(since, tries + 1);
      else {
        setState('error');
        setMsg('7분이 지나도 결과가 오지 않았어요. 잠시 뒤 다시 눌러 주세요.');
      }
    }, 15_000);
  };
  const start = async () => {
    setState('checking');
    setMsg('');
    try {
      await api.start();
      poll(Date.now() - 60_000);
    } catch (e) {
      setState('error');
      setMsg((e as Error).message || '검사를 시작하지 못했어요.');
    }
  };
  const groups = report ? groupFindings(report.findings) : [];
  return (
    <div className="health">
      {report && (
        <>
          <p className="small">
            <b>디자인 검사 {report.ok ? `${report.findings.length}건` : '실패'}</b>
            <span className="muted"> · 데스크톱·휴대폰 폭{report.designMd ? ' · 디자인 기준 적용' : ''}</span>
          </p>
          {report.ok && groups.length === 0 && <p className="muted small">걸린 것이 없어요.</p>}
          {groups.length > 0 && (
            <ul className="health-list">
              {groups.map((g) => (
                <li key={g.label}>
                  <b>{g.label}</b> <span className="muted small">{g.count}곳 · {g.views}</span>
                  {g.example && <p className="muted small health-items">{g.example}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="health-actions">
        <button type="button" className="btn btn-small btn-ghost" disabled={state === 'checking'} onClick={() => void start()}>
          {state === 'checking' ? '디자인 검사 중… (2~4분)' : report ? '디자인 다시 검사' : '디자인 자동 검사'}
        </button>
      </div>
      {msg && <p className="task-error small">{msg}</p>}
    </div>
  );
}
