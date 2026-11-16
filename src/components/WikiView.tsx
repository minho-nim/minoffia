// LLM 위키(v0.7.41 소유자 "컨텍스트 엔지니어링: 2 ㄱㄱ"): 프로젝트 카드에서 읽는 한 장짜리 위키.
// 업무가 배포까지 끝나면 서버가 고쳐 쓴다. 사람은 읽기·[다시 정리]만(직접 고치지 않는다). 마크다운은 제목·목록만 간단히 그린다.
import { useEffect, useState } from 'react';
import type { OfficeStore } from '../data/store';

type Wiki = NonNullable<Awaited<ReturnType<NonNullable<OfficeStore['wiki']>['get']>>>;

export function WikiBody({ body }: { body: string }) {
  const blocks: JSX.Element[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) blocks.push(<ul key={`u${k}`}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  body.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^-\s+/.test(line)) return void list.push(line.replace(/^-\s+/, ''));
    flush(i);
    if (/^#{2,3}\s+/.test(line)) blocks.push(<h4 key={i}>{line.replace(/^#{2,3}\s+/, '')}</h4>);
    else if (line.trim()) blocks.push(<p key={i}>{line}</p>);
  });
  flush(-1);
  return <div className="wiki-body">{blocks}</div>;
}

export function WikiView({ projectId, api }: { projectId: string; api: NonNullable<OfficeStore['wiki']> }) {
  const [wiki, setWiki] = useState<Wiki | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => api.get(projectId).then(setWiki, () => setWiki(null));
  useEffect(() => {
    void load();
  }, [projectId]);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg('');
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setMsg((e as Error).message || '하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  if (wiki === undefined) return <p className="muted small">위키를 불러오는 중…</p>;
  return (
    <div className="wiki-view">
      {wiki?.body ? (
        <>
          <p className="muted small">
            업무 {wiki.tasks}개로 정리 · {wiki.judge || 'AI'} · {wiki.updatedAt.slice(0, 10)}. 업무가 배포까지 끝나면 AI가 고쳐 써요(대화 질문·개발 지시서에 참고 자료로 붙어요).
          </p>
          <WikiBody body={wiki.body} />
        </>
      ) : (
        <p className="muted small">아직 위키가 없어요. 배포까지 끝난 업무가 있으면 아래 버튼으로 바로 만들 수 있어요(Gemini 무료 1번).</p>
      )}
      <p className="wiki-actions">
        <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(async () => ((await api.rebuild(projectId)) === 'skipped' ? '배포까지 끝난 업무가 없어서 만들 게 없어요.' : '다시 정리했어요.'))}>
          {busy ? '정리하는 중…' : wiki?.body ? '다시 정리' : '위키 만들기'}
        </button>
        <button type="button" className="link-btn small" disabled={busy} onClick={() => void run(async () => `빈 프로젝트 ${await api.fillAll()}개를 채우는 중이에요(몇 분, 다시 열면 보여요).`)}>
          빈 프로젝트 모두 채우기
        </button>
      </p>
      {msg && <p className="small muted">{msg}</p>}
    </div>
  );
}
