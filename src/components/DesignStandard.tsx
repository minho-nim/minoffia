// 프로젝트 디자인 기준(v0.5.56, 소유자 목록 30번): Gemini(무료)가 저장소 스타일 파일을 보고 초안을 쓰고, 소유자가 고쳐서 승인하면 확정된다.
// 확정된 기준은 디자인 자동 검사와 디자인 업무 채점이 쓴다.
import { useState } from 'react';

export type DesignStandardApi = { draft: () => Promise<string>; approve: (md: string) => Promise<void> };

export function DesignStandard({ approved, draft, api }: { approved: string; draft: string; api: DesignStandardApi }) {
  const [text, setText] = useState(draft || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(!approved && !!draft);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message || '하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="design-standard">
      {approved && !editing ? (
        <>
          <p className="muted small">확정된 기준이에요. 디자인 자동 검사와 디자인 업무 채점이 이 기준을 써요.</p>
          <pre className="design-md">{approved}</pre>
        </>
      ) : !text ? (
        <p className="muted small">아직 기준이 없어요. Gemini(무료)가 저장소의 스타일 파일(css·tailwind 설정 등)을 보고 색·글꼴·글자 크기·둥글기를 정리해 초안을 써요.</p>
      ) : (
        <>
          <p className="muted small">초안이에요. 고칠 곳을 고친 뒤 승인하면 확정돼요.</p>
          <textarea className="design-md" rows={12} value={text} maxLength={8000} onChange={(e) => setText(e.target.value)} aria-label="디자인 기준 초안" />
        </>
      )}
      <div className="health-actions">
        {text && (!approved || editing) && (
          <button type="button" className="btn btn-small" disabled={busy || !text.trim().startsWith('# 디자인 기준')} onClick={() => void run(async () => {
            await api.approve(text.trim());
            setEditing(false);
            setMsg('확정했어요.');
          })}>
            이 기준으로 승인
          </button>
        )}
        {approved && !editing && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => { setText(approved); setEditing(true); }}>
            고치기
          </button>
        )}
        <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(async () => {
          setText(await api.draft());
          setEditing(true);
        })}>
          {busy ? '쓰는 중…' : text || approved ? '초안 다시 쓰기' : '초안 쓰기(Gemini)'}
        </button>
      </div>
      {msg && <p className={msg === '확정했어요.' ? 'muted small' : 'task-error small'}>{msg}</p>}
    </div>
  );
}
