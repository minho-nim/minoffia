import { useState } from 'react';
import type { ChatEntry } from '../domain/devlog';
import { buildDevlog } from '../domain/devlog';
import type { Snapshot } from '../domain/types';
import { kstDay } from '../domain/usage';

interface Props {
  snap: Snapshot;
  /** 기간의 대화 기록(시간순) */
  loadChat: (fromIso: string, toIso: string) => Promise<ChatEntry[]>;
  /** 기간(·프로젝트)의 대화 기록을 지우고 지운 수를 돌려준다 */
  deleteChat: (fromIso: string, toIso: string, projectId?: string) => Promise<number>;
  onCopy: (text: string) => Promise<boolean>;
}

/** KST 날짜(YYYY-MM-DD) 0시의 UTC 시각 */
const kstStart = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() - 9 * 3600_000).toISOString();
const nextDay = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10);

/**
 * 개발일지: 입력창 대화와 업무 기록을 프로젝트별·날짜별 Markdown으로 모은다(AI 호출 없음).
 * 이 글을 개발일지 프로젝트에 올리면 AI가 정리한다.
 */
export function DevlogPanel({ snap, loadChat, deleteChat, onCopy }: Props) {
  const today = kstDay();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [projectId, setProjectId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = async () => {
    setBusy(true);
    setConfirmDelete(false);
    try {
      const n = await deleteChat(kstStart(from), kstStart(nextDay(to)), projectId || undefined);
      setNote(`대화 기록 ${n}건을 지웠습니다. 업무 기록(기획서·승인·결과 등)은 그대로입니다.`);
      setText('');
    } catch (e) {
      setNote(`대화 기록을 지우지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const build = async () => {
    if (from > to) return setNote('시작 날짜가 끝 날짜보다 늦습니다.');
    setBusy(true);
    setNote('');
    try {
      const chat = await loadChat(kstStart(from), kstStart(nextDay(to)));
      setText(buildDevlog(snap, chat, { from, to }, projectId || undefined));
    } catch (e) {
      setNote(`대화 기록을 읽지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const name = `devlog-${from === to ? from : `${from}_${to}`}${projectId ? `-${snap.projects.find((p) => p.id === projectId)?.name ?? ''}` : ''}.md`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[\\/:*?"<>|\s]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="devlog" aria-labelledby="devlog-title">
      <h3 id="devlog-title">개발일지</h3>
      {/* v0.6.41: 설명은 ⓘ를 눌러야 보이게(읽을 글 줄이기) */}
      <details className="info-note">
        <summary aria-label="설명 보기">ⓘ</summary>
        <p className="muted small">프로젝트 업무 대화와 업무 기록(기획서·승인·계획·결과·PR·배포)을 프로젝트별·날짜별로 모읍니다. 일반 대화·질문은 기록하지 않습니다.</p>
      </details>
      <div className="devlog-controls">
        <label className="field">
          <span>시작</span>
          <input id="devlog-from" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>끝</span>
          <input id="devlog-to" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          <span>프로젝트</span>
          <select id="devlog-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">전체</option>
            {snap.projects
              .filter((p) => !p.sample)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void build()}>
          {busy ? '모으는 중…' : '개발일지 만들기'}
        </button>
      </div>
      {note && <p className="small">{note}</p>}
      {text && (
        <>
          <textarea id="devlog-text" className="devlog-text mono" readOnly value={text} rows={12} />
          <div className="devlog-actions">
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => void onCopy(text).then((ok) => setNote(ok ? '복사했습니다.' : '복사가 막혔습니다. 위 칸을 길게 눌러 직접 복사하세요.'))}
            >
              복사
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={download}>
              .md 내려받기
            </button>
          </div>
        </>
      )}
      <div className="devlog-actions">
        {confirmDelete ? (
          <>
            <span className="small">
              {from === to ? from : `${from} ~ ${to}`} {projectId ? `'${snap.projects.find((p) => p.id === projectId)?.name ?? ''}'` : '전체 프로젝트'}의 대화 기록을 지울까요? 되돌릴 수 없습니다.
            </span>
            <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => void remove()}>
              지우기
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmDelete(false)}>
              취소
            </button>
          </>
        ) : (
          <button type="button" className="link-btn small" disabled={busy} onClick={() => setConfirmDelete(true)}>
            이 기간 대화 기록 지우기
          </button>
        )}
      </div>
    </section>
  );
}
