// 프로젝트 디자인 기준(v0.5.56, 소유자 목록 30번): Gemini(무료)가 저장소 스타일 파일을 보고 초안을 쓰고, 소유자가 고쳐서 승인하면 확정된다.
// 확정된 기준은 디자인 자동 검사와 디자인 업무 채점이 쓴다.
// v0.7.50 '참고할 서비스 고르기': 유명 서비스 디자인 규칙(design-reference 스킬 고정본)을 1~3개 골라 초안에 "구조만 참고"로 넘긴다.
import { useState } from 'react';
import { cleanDesignRefs, DESIGN_REF_GROUPS, DESIGN_REF_MAX, DESIGN_REFS, type DesignRefGroup } from '../domain/designRefs';

export type DesignStandardApi = { draft: (refs: string[]) => Promise<string>; approve: (md: string) => Promise<void> };

/** 참고할 서비스 고르기(분류 칩 + 찾기 + 목록, 최대 3개) */
function RefPicker({ picked, onChange }: { picked: string[]; onChange: (next: string[]) => void }) {
  const [group, setGroup] = useState<DesignRefGroup | 'all'>('all');
  const [q, setQ] = useState('');
  const word = q.trim().toLowerCase();
  const list = DESIGN_REFS.filter((r) => (group === 'all' || r.group === group) && (!word || r.name.toLowerCase().includes(word) || r.mood.includes(q.trim())));
  const full = picked.length >= DESIGN_REF_MAX;
  const toggle = (slug: string) => onChange(picked.includes(slug) ? picked.filter((s) => s !== slug) : cleanDesignRefs([...picked, slug]));
  return (
    <div className="ref-picker">
      <p className="muted small">고른 서비스의 디자인 규칙을 <b>구조만</b> 참고해요(색 역할·글자 크기 단계·간격·모서리). 대표 색·로고·이름은 따라 하지 않고 이 프로젝트 색으로 바꿔요. 최대 {DESIGN_REF_MAX}개.</p>
      <div className="skill-cats" role="group" aria-label="참고 서비스 분류">
        <button type="button" className="chip" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>전체</button>
        {DESIGN_REF_GROUPS.map((g) => (
          <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => setGroup(group === g ? 'all' : g)}>
            {g}
          </button>
        ))}
      </div>
      <input type="search" className="skill-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="찾기: 이름이나 분위기(예: 어두운, 따뜻한)" aria-label="참고 서비스 찾기" />
      <ul className="ref-list">
        {list.map((r) => {
          const on = picked.includes(r.slug);
          return (
            <li key={r.slug}>
              <button type="button" className="ref-item" aria-pressed={on} disabled={!on && full} onClick={() => toggle(r.slug)}>
                <span className="ref-name">{on ? '✓ ' : ''}{r.name}</span>
                <span className="ref-mood">{r.mood}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="muted small">맞는 서비스가 없어요.</li>}
      </ul>
      <p className="muted small">자료: VoltAgent/awesome-design-md(MIT)를 스킬 저장소에 고정해 둔 것. 각 서비스를 보고 해석한 글이라 공식 문서는 아니에요.</p>
    </div>
  );
}

export function DesignStandard({ approved, draft, api }: { approved: string; draft: string; api: DesignStandardApi }) {
  const [text, setText] = useState(draft || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(!approved && !!draft);
  const [refs, setRefs] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const nameOf = (slug: string) => DESIGN_REFS.find((r) => r.slug === slug)?.name ?? slug;
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
        <p className="muted small">아직 기준이 없어요. Gemini(무료)가 저장소의 스타일 파일(css·tailwind 설정 등)을 보고 색·글꼴·글자 크기·둥글기를 정리해 초안을 써요. 스타일 파일이 없거나 새로 정하고 싶으면 '참고할 서비스 고르기'로 유명 서비스의 구조를 참고할 수 있어요.</p>
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
        <button type="button" className="btn btn-small btn-ghost" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
          {refs.length ? `참고 ${refs.length}개 고름` : '참고할 서비스 고르기'}
        </button>
        <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(async () => {
          setText(await api.draft(refs));
          setEditing(true);
          setPicking(false);
        })}>
          {busy ? '쓰는 중…' : refs.length ? '고른 서비스 참고해 초안 쓰기' : text || approved ? '초안 다시 쓰기' : '초안 쓰기(Gemini)'}
        </button>
      </div>
      {refs.length > 0 && (
        <p className="ref-picked small">
          참고:{' '}
          {refs.map((s) => (
            <button key={s} type="button" className="chip chip-small" onClick={() => setRefs(refs.filter((x) => x !== s))} aria-label={`${nameOf(s)} 빼기`}>
              {nameOf(s)} ✕
            </button>
          ))}
        </p>
      )}
      {picking && <RefPicker picked={refs} onChange={setRefs} />}
      {msg && <p className={msg === '확정했어요.' ? 'muted small' : 'task-error small'}>{msg}</p>}
    </div>
  );
}
