import { useEffect, useRef, useState } from 'react';
import {
  fileNameFor,
  ROLE_LABEL,
  validateFile,
  type Attachment,
  type AttachmentRole,
} from '../domain/attachments';

/** 아직 저장하지 않은 이미지(업무 접수·결과 등록 폼에서 고르는 중) */
export interface PendingImage {
  key: string;
  file: File;
  role: AttachmentRole;
  note: string;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 파일 선택·붙여넣기·끌어다 놓기로 들어온 파일을 검사해서 이미지만 돌려준다. */
function takeImages(list: FileList | File[] | null, room: number): { files: File[]; errors: string[] } {
  const files: File[] = [];
  const errors: string[] = [];
  [...(list ?? [])].forEach((raw, i) => {
    const file = raw.name && raw.name.includes('.') ? raw : new File([raw], fileNameFor(raw.name, raw.type, i), { type: raw.type });
    const err = validateFile(file);
    if (err) errors.push(err);
    else if (files.length >= room) errors.push(`${file.name}: 장수 상한을 넘어 넣지 않았습니다.`);
    else files.push(file);
  });
  return { files, errors };
}

function RoleChips({ roles, value, onChange, disabled }: { roles: AttachmentRole[]; value: AttachmentRole; onChange: (r: AttachmentRole) => void; disabled?: boolean }) {
  return (
    <span className="att-roles" role="group" aria-label="이미지 역할">
      {roles.map((r) => (
        <button key={r} type="button" className="att-role" aria-pressed={value === r} disabled={disabled} onClick={() => onChange(r)}>
          {ROLE_LABEL[r]}
        </button>
      ))}
    </span>
  );
}

/** 선택 버튼 + 붙여넣기/끌어다 놓기 칸 */
function DropZone({ onFiles, disabled, label }: { onFiles: (files: FileList | File[]) => void; disabled?: boolean; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`att-drop${over ? ' is-over' : ''}`}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onPaste={(e) => {
        if (disabled) return;
        const files = [...e.clipboardData.files];
        if (files.length) {
          e.preventDefault();
          onFiles(files);
        }
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles(e.dataTransfer.files);
      }}
    >
      <button type="button" className="btn btn-small btn-ghost" disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </button>
      <span className="muted small">또는 이 칸을 누르고 Ctrl+V · 끌어다 놓기 · PNG·JPG·WEBP·GIF 5MB까지</span>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return src ? <img className="att-thumb" src={src} alt={alt} /> : <span className="att-thumb att-thumb-empty" aria-hidden="true" />;
}

/** 폼 안에서 고르는 중인 이미지. 저장은 폼을 낼 때 한다. */
export function ImagePicker({
  items,
  onChange,
  roles,
  max,
  label = '이미지 추가',
}: {
  items: PendingImage[];
  onChange: (items: PendingImage[]) => void;
  roles: AttachmentRole[];
  max: number;
  label?: string;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const it of items) next[it.key] = urls[it.key] ?? URL.createObjectURL(it.file);
    for (const [k, u] of Object.entries(urls)) if (!next[k]) URL.revokeObjectURL(u);
    setUrls(next);
    // urls는 이 효과 안에서만 바꾼다(items가 바뀔 때만 다시 계산).
  }, [items]);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  // 폼을 닫으면 미리보기 주소를 놓아준다.
  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (list: FileList | File[]) => {
    const { files, errors } = takeImages(list, max - items.length);
    setErrors(errors);
    onChange([
      ...items,
      ...files.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, role: items.length + i === 0 ? roles[0] : roles[roles.length > 1 ? 1 : 0], note: '' })),
    ]);
  };
  const set = (key: string, patch: Partial<PendingImage>) => onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="att">
      {items.length > 0 && (
        <ol className="att-list">
          {items.map((it, i) => (
            <li key={it.key} className="att-item">
              <Thumb src={urls[it.key] ?? null} alt={it.file.name} />
              <div className="att-body">
                <p className="att-name small">
                  {i + 1}. {it.file.name} <span className="muted">· {kb(it.file.size)}</span>
                </p>
                <RoleChips roles={roles} value={it.role} onChange={(role) => set(it.key, { role })} />
                <input className="att-note" placeholder="설명(선택): 예) 버튼이 잘려 보임" value={it.note} maxLength={500} onChange={(e) => set(it.key, { note: e.target.value })} />
              </div>
              <span className="att-tools">
                <button type="button" className="btn btn-small btn-ghost" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn-small btn-ghost" aria-label="아래로" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => onChange(items.filter((x) => x.key !== it.key))}>
                  빼기
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {items.length < max && <DropZone onFiles={add} label={label} />}
      {errors.length > 0 && (
        <ul className="task-error small">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 저장된 첨부. 잠기지 않았으면 추가·순서·역할·설명·삭제를 바로 저장한다. */
export function AttachmentGallery({
  items,
  roles,
  blocker,
  max,
  urlFor,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
  emptyText,
}: {
  items: Attachment[];
  roles: AttachmentRole[];
  /** 바꿀 수 없으면 이유. null이면 편집 가능 */
  blocker: string | null;
  max: number;
  urlFor: (a: Attachment) => Promise<string>;
  onAdd?: (files: File[]) => Promise<string[]>;
  onUpdate?: (a: Attachment) => Promise<boolean>;
  onDelete?: (a: Attachment) => Promise<boolean>;
  onMove?: (id: string, delta: -1 | 1) => Promise<boolean>;
  emptyText?: string;
}) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const editable = !blocker && !!onUpdate;

  useEffect(() => {
    let alive = true;
    for (const a of items) {
      if (urls[a.id] !== undefined) continue;
      setUrls((u) => ({ ...u, [a.id]: null }));
      urlFor(a)
        .then((url) => alive && setUrls((u) => ({ ...u, [a.id]: url })))
        .catch((e: Error) => alive && setFailed((f) => ({ ...f, [a.id]: e.message })));
    }
    return () => {
      alive = false;
    };
    // 새로 생긴 첨부만 주소를 받는다.
  }, [items]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="att">
      {items.length === 0 ? (
        emptyText && <p className="muted small">{emptyText}</p>
      ) : (
        <ol className="att-list">
          {items.map((a, i) => (
            <li key={a.id} className="att-item">
              {urls[a.id] ? (
                <a href={urls[a.id]!} target="_blank" rel="noreferrer" title="원본 보기">
                  <Thumb src={urls[a.id]!} alt={a.fileName} />
                </a>
              ) : (
                <Thumb src={null} alt={a.fileName} />
              )}
              <div className="att-body">
                <p className="att-name small">
                  {i + 1}. {a.fileName} <span className="muted">· {kb(a.sizeBytes)}</span>
                  {failed[a.id] && <span className="task-error"> · {failed[a.id]}</span>}
                </p>
                {editable ? (
                  <>
                    <RoleChips roles={roles} value={a.role} disabled={busy} onChange={(role) => void act(() => onUpdate!({ ...a, role }))} />
                    <input
                      className="att-note"
                      placeholder="설명(선택)"
                      value={notes[a.id] ?? a.note}
                      maxLength={500}
                      onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                      onBlur={() => {
                        const note = notes[a.id];
                        if (note !== undefined && note !== a.note) void act(() => onUpdate!({ ...a, note }));
                      }}
                    />
                  </>
                ) : (
                  <p className="small">
                    <span className="pill">{ROLE_LABEL[a.role]}</span> {a.note}
                  </p>
                )}
              </div>
              {editable && (
                <span className="att-tools">
                  {onMove && (
                    <>
                      <button type="button" className="btn btn-small btn-ghost" aria-label="위로" disabled={busy || i === 0} onClick={() => void act(() => onMove(a.id, -1))}>
                        ↑
                      </button>
                      <button type="button" className="btn btn-small btn-ghost" aria-label="아래로" disabled={busy || i === items.length - 1} onClick={() => void act(() => onMove(a.id, 1))}>
                        ↓
                      </button>
                    </>
                  )}
                  {onDelete && (
                    <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void act(() => onDelete(a))}>
                      지우기
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {blocker && items.length > 0 && <p className="muted small">{blocker}</p>}
      {!blocker && onAdd && items.length < max && (
        <DropZone
          disabled={busy}
          label={busy ? '올리는 중…' : '이미지 추가'}
          onFiles={(list) =>
            void act(async () => {
              const { files, errors } = takeImages(list, max - items.length);
              setErrors([...errors, ...(files.length ? await onAdd(files) : [])]);
            })
          }
        />
      )}
      {errors.length > 0 && (
        <ul className="task-error small">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
