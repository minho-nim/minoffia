// 프로젝트 순서(v0.6.43 소유자 "수정을 눌렀을 때 화살표가 나오게, 드래그로 움직이기"): 평소엔 목록만, '수정'을 누르면 ▲▼와 끌기 손잡이.
// 끌기는 손가락·마우스 모두(포인터 이벤트). 놓을 때 한 번만 저장한다.
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../domain/types';
import { moveProject } from '../domain/projectOrder';

export function ProjectOrder({ projects, onSave }: { projects: Project[]; onSave?: (ids: string[]) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const byId = new Map(projects.map((p) => [p.id, p]));
  // 프로젝트가 늘거나 줄면 끌던 순서는 버리고 받은 순서를 쓴다
  const ids = draft && draft.length === projects.length && draft.every((id) => byId.has(id)) ? draft : projects.map((p) => p.id);
  const list = ids.map((id) => byId.get(id)).filter((p): p is Project => !!p);

  const save = (next: string[]) => {
    setDraft(next);
    void onSave?.(next);
  };
  // 아이폰(v0.6.44 소유자 "드래그가 안 됨"): 손가락은 처음 누른 손잡이에 붙어 있어 목록이 움직임을 못 받았다.
  // 손잡이가 포인터를 잡고(setPointerCapture), 손가락 아래 칸을 elementFromPoint로 찾는다. 끄는 동안은 화면 스크롤을 막는다.
  const moveTo = (x: number, y: number) => {
    if (!dragId) return;
    const li = document.elementFromPoint(x, y)?.closest<HTMLLIElement>('li[data-id]');
    const to = li?.dataset.id;
    if (!to || to === dragId || !listRef.current?.contains(li!)) return;
    const cur = [...ids];
    cur.splice(cur.indexOf(dragId), 1);
    cur.splice(cur.indexOf(to) + (cur.indexOf(to) >= ids.indexOf(dragId) ? 1 : 0), 0, dragId);
    setDraft(cur);
  };
  const end = () => {
    if (dragId && draft) void onSave?.(draft);
    setDragId(null);
  };
  useEffect(() => {
    if (!dragId) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, [dragId]);

  return (
    <div className="project-order">
      <div className="order-head">
        <h3>프로젝트 순서</h3>
        <button type="button" className="btn btn-small btn-ghost" disabled={!onSave} onClick={() => setEditing((v) => !v)}>
          {editing ? '완료' : '수정'}
        </button>
      </div>
      <p className="muted small">업무·대화의 프로젝트 칩과 프로젝트 탭이 이 순서를 따라요.{editing ? ' ☰를 끌거나 ▲▼로 옮기세요.' : ''}</p>
      <ol ref={listRef} className={`order-list${editing ? ' is-editing' : ''}`}>
        {list.map((p, i) => (
          <li key={p.id} data-id={p.id} className={dragId === p.id ? 'is-drag' : ''}>
            {editing && (
              <span
                className="order-handle"
                aria-label={`${p.name} 끌어서 옮기기`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setDragId(p.id);
                }}
                onPointerMove={(e) => moveTo(e.clientX, e.clientY)}
                onPointerUp={end}
                onPointerCancel={end}
              >
                ☰
              </span>
            )}
            <span className="order-name">{p.name}</span>
            {editing && (
              <span className="order-btns">
                <button type="button" className="btn btn-small btn-ghost" aria-label={`${p.name} 위로`} disabled={i === 0} onClick={() => save(moveProject(list, p.id, -1))}>
                  ▲
                </button>
                <button type="button" className="btn btn-small btn-ghost" aria-label={`${p.name} 아래로`} disabled={i === list.length - 1} onClick={() => save(moveProject(list, p.id, 1))}>
                  ▼
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
