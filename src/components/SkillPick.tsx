// 개발 스킬 고르기(v0.7.0, 소유자 "알맞은 스킬이 있으면 뭐 쓰겠다고 대화에서 고르면 그걸 참고해서 시작"):
// 업무를 접수한 메시지 아래에 추천 스킬을 미리 골라 두고 묻는다. 고른 것은 업무에 저장되어 개발 지시서에 한 줄로 들어간다.
// shortcut: '스킬 없이'는 이 화면에서만 기억한다(새로고침하면 다시 묻는다), 자주 거슬리면 업무에 '안 씀'을 저장한다.
import { useMemo, useState } from 'react';
import type { Task } from '../domain/types';
import { suggestSkills } from '../domain/skillPick';

export function SkillPick({ task, installed, titleOf, onSave }: { task: Task; installed: string[]; titleOf?: (name: string) => string; onSave: (task: Task, skills: string[]) => Promise<boolean> }) {
  const suggested = useMemo(() => suggestSkills(`${task.title}\n${task.description}\n${task.userOriginalText ?? ''}`, installed), [task.id, installed.join()]);
  const chosen = task.skills ?? [];
  const [open, setOpen] = useState(!chosen.length && suggested.length > 0);
  const [sel, setSel] = useState<string[]>(chosen.length ? chosen : suggested);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  if (task.status === 'done' || task.stage === 'cancelled') return null;
  const label = (n: string) => (titleOf?.(n) ? `${titleOf(n)} (${n})` : n);
  if (!open)
    return (
      <span className="small muted skill-pick-line">
        {chosen.length ? `개발에 쓸 스킬: ${chosen.map(label).join(', ')}` : '개발 스킬: AI가 알아서'}{' '}
        <button type="button" className="link-btn" onClick={() => { setSel(chosen.length ? chosen : suggested); setOpen(true); }}>
          {chosen.length ? '바꾸기' : '고르기'}
        </button>
      </span>
    );
  const others = installed.filter((n) => !suggested.includes(n) && n !== 'repo-map');
  const chip = (n: string) => (
    <button key={n} type="button" className="chip skill-pick-chip" aria-pressed={sel.includes(n)} onClick={() => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))}>
      {label(n)}
    </button>
  );
  const save = async (skills: string[]) => {
    setBusy(true);
    const ok = await onSave(task, skills);
    setBusy(false);
    if (ok) setOpen(false);
  };
  return (
    <div className="skill-pick" role="group" aria-label="개발에 쓸 스킬 고르기">
      <p className="small">{suggested.length ? '개발할 때 이 스킬을 쓸까요? (기획 승인 뒤 개발이 시작될 때 지시서에 들어가요)' : '개발할 때 쓸 스킬을 고르세요.'}</p>
      <div className="skill-pick-chips">
        {suggested.map(chip)}
        {others.length > 0 && (
          <button type="button" className="link-btn small" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            {more ? '▼' : '▶'} 다른 스킬 {others.length}개
          </button>
        )}
        {more && others.map(chip)}
      </div>
      <span className="inbox-choices">
        <button type="button" className="btn btn-small btn-primary" disabled={busy || !sel.length} onClick={() => void save(sel)}>
          {sel.length ? `이 ${sel.length}개로` : '고른 스킬 없음'}
        </button>
        <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => (chosen.length ? void save([]) : setOpen(false))}>
          스킬 없이
        </button>
      </span>
    </div>
  );
}
