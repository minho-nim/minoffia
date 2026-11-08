// 바뀐 곳 구조도(Archify) 보기(v0.5.43, 소유자 "Archify만 화면에"): 누르면 서버가 그린 Archify 그림을 크게 연다.
// 아직 없으면 GitHub Actions가 그리기 시작하고(1~2분), 다 되면 같은 버튼으로 연다. AI 호출 없음.
// 그림은 Archify(고정 커밋)가 만든 HTML이라 확대·접기 스크립트가 있어, 앱과 분리된 창(sandbox, 같은 출처 권한 없음)에서만 돌린다.
import { useEffect, useRef, useState } from 'react';

type Load = () => Promise<{ html?: string; started?: boolean }>;

export function ArchifyView({ load }: { load: Load }) {
  const [html, setHtml] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'drawing' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  const open = async (tries = 0): Promise<void> => {
    setState('busy');
    try {
      const r = await load();
      if (r.html) {
        setHtml(r.html);
        setState('idle');
        return;
      }
      // 그리는 중: 15초마다 다시 본다(최대 6분)
      setState('drawing');
      if (tries < 24) timer.current = window.setTimeout(() => void open(tries + 1), 15_000);
      else {
        setState('error');
        setMsg('6분이 지나도 그림이 오지 않았어요. 잠시 뒤 다시 눌러 주세요.');
      }
    } catch (e) {
      setState('error');
      setMsg((e as Error).message || '구조도를 열지 못했어요.');
    }
  };

  return (
    <>
      <button type="button" className="btn btn-small" disabled={state === 'busy' || state === 'drawing'} onClick={() => void open()}>
        {state === 'drawing' ? 'Archify 구조도 그리는 중… (1~2분)' : state === 'busy' ? '여는 중…' : 'Archify 구조도 크게 보기'}
      </button>
      {state === 'error' && <p className="task-error small">{msg}</p>}
      {html && (
        <div className="archify-modal" role="dialog" aria-label="바뀐 곳 구조도(Archify)" onClick={() => setHtml(null)}>
          <div className="archify-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="archify-close" onClick={() => setHtml(null)} aria-label="닫기">
              ×
            </button>
            <iframe className="archify-frame" sandbox="allow-scripts" srcDoc={html} title="바뀐 곳 구조도(Archify)" />
          </div>
        </div>
      )}
    </>
  );
}
