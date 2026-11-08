import { ImageZoom } from './ImageZoom';
import { PointFix } from './PointFix';
import { useEffect, useRef, useState } from 'react';
import { FilePreview } from './FilePreview';
import {
  ACCEPT_IMAGES,
  ACCEPT_REQUEST,
  canGeminiRead,
  isImage,
  isRaster,
  MIME_EXT,
  prepareFile,
  previewKind,
  ROLE_LABEL,
  validateFile,
  type Attachment,
  type AttachmentRole,
  type ImageAnalysis,
} from '../domain/attachments';

/** 아직 저장하지 않은 이미지·문서(업무 접수·결과 등록 폼에서 고르는 중) */
export interface PendingImage {
  key: string;
  file: File;
  role: AttachmentRole;
  note: string;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 파일 선택·붙여넣기·끌어다 놓기로 들어온 파일을 검사해서 받을 수 있는 것만 돌려준다(allowDocs면 문서도). */
function takeImages(list: FileList | File[] | null, room: number, allowDocs: boolean): { files: File[]; errors: string[] } {
  const files: File[] = [];
  const errors: string[] = [];
  [...(list ?? [])].forEach((raw, i) => {
    const file = prepareFile(raw, i, allowDocs);
    const err = validateFile(file, allowDocs);
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
function DropZone({ onFiles, disabled, label, allowDocs = false }: { onFiles: (files: FileList | File[]) => void; disabled?: boolean; label: string; allowDocs?: boolean }) {
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
      <span className="muted small">
        또는 이 칸을 누르고 Ctrl+V · 끌어다 놓기 · 이미지(PNG·JPG·WEBP·GIF{allowDocs ? '·SVG' : ''}) 5MB{allowDocs ? ' · 문서(PDF·TXT·MD·CSV·JSON·HTML·DOCX·XLSX·PPTX·ZIP) 20MB' : ''}까지
      </span>
      <input
        ref={input}
        type="file"
        accept={allowDocs ? ACCEPT_REQUEST : ACCEPT_IMAGES}
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

/** 그림이 아니어서 열어 볼 수 있는 파일(SVG·HTML·문서·ZIP) */
const previewable = (mime: string) => !isRaster(mime) && previewKind(mime) !== null;
/** 비공개 주소를 새 탭으로 바로 열어도 되는 파일(HTML·SVG는 글로 저장돼 있어 미리보기로만 본다) */
const linkable = (mime: string) => mime !== 'text/html' && mime !== 'image/svg+xml';

function PreviewToggle({ name, mime, load, openUrl }: { name: string; mime: string; load: () => Promise<Blob>; openUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-small btn-ghost att-analyze" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '미리보기 닫기' : '미리보기'}
      </button>
      {open && <FilePreview name={name} mime={mime} load={load} openUrl={openUrl} />}
    </>
  );
}

function Thumb({ src, alt, mime }: { src: string | null; alt: string; mime: string }) {
  // 그림이 아니면(SVG 포함) 미리보기 대신 확장자 표시
  if (!isRaster(mime)) return <span className="att-thumb att-thumb-doc" aria-hidden="true">{(MIME_EXT[mime] ?? 'file').toUpperCase()}</span>;
  return src ? <img className="att-thumb" src={src} alt={alt} /> : <span className="att-thumb att-thumb-empty" aria-hidden="true" />;
}

/** 이 파일에 보일 역할(문서는 '문서·자료' 하나) */
const rolesOf = (roles: AttachmentRole[], mime: string): AttachmentRole[] => (isImage(mime) || roles.includes('prototype') ? roles : ['document']);

/** 폼 안에서 고르는 중인 이미지. 저장은 폼을 낼 때 한다. */
export function ImagePicker({
  items,
  onChange,
  roles,
  max,
  label = '이미지 추가',
  allowDocs = false,
}: {
  items: PendingImage[];
  onChange: (items: PendingImage[]) => void;
  roles: AttachmentRole[];
  max: number;
  label?: string;
  /** 요청 자료면 문서도 받는다 */
  allowDocs?: boolean;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<{ src: string; name: string } | null>(null);
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
    const { files, errors } = takeImages(list, max - items.length, allowDocs);
    setErrors(errors);
    onChange([
      ...items,
      ...files.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        role: !isImage(file.type) ? ('document' as const) : items.length + i === 0 ? roles[0] : roles[roles.length > 1 ? 1 : 0],
        note: '',
      })),
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
      {zoom && <ImageZoom src={zoom.src} name={zoom.name} onClose={() => setZoom(null)} />}
      {items.length > 0 && (
        <ol className="att-list">
          {items.map((it, i) => (
            <li key={it.key} className="att-item">
              {urls[it.key] && isRaster(it.file.type) ? (
                <button type="button" className="att-zoom" onClick={() => setZoom({ src: urls[it.key]!, name: it.file.name })} aria-label={`${it.file.name} 크게 보기`}>
                  <Thumb src={urls[it.key]!} alt={it.file.name} mime={it.file.type} />
                </button>
              ) : (
                <Thumb src={urls[it.key] ?? null} alt={it.file.name} mime={it.file.type} />
              )}
              <div className="att-body">
                <p className="att-name small">
                  {i + 1}. {it.file.name} <span className="muted">· {kb(it.file.size)}</span>
                </p>
                <RoleChips roles={rolesOf(roles, it.file.type)} value={it.role} onChange={(role) => set(it.key, { role })} />
                <input className="att-note" placeholder="설명(선택): 예) 버튼이 잘려 보임" value={it.note} maxLength={500} onChange={(e) => set(it.key, { note: e.target.value })} />
                {previewable(it.file.type) && <PreviewToggle name={it.file.name} mime={it.file.type} load={async () => it.file} />}
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
      {items.length < max && <DropZone onFiles={add} label={label} allowDocs={allowDocs} />}
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
  analyses,
  onAnalyze,
  onPoint,
  analyzeBlocker,
  allowDocs = false,
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
  /** Gemini 이미지 분석 결과(첨부 id → 분석) */
  analyses?: Map<string, ImageAnalysis>;
  /** 분석 요청(쓸 수 없으면 없음) */
  onAnalyze?: (a: Attachment) => Promise<boolean>;
  /** 분석할 수 없는 이유(예: 기획 승인 뒤 잠김) */
  analyzeBlocker?: string | null;
  /** 화면 짚어서 수정: 사진을 눌러 고칠 곳을 표시하면 그 글을 받는다(v0.5.48) */
  onPoint?: (text: string) => void;
  /** 요청 자료면 문서도 받는다 */
  allowDocs?: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState<{ src: string; name: string } | null>(null);
  const [pointing, setPointing] = useState<{ src: string; name: string } | null>(null);
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
      {zoom && <ImageZoom src={zoom.src} name={zoom.name} onClose={() => setZoom(null)} />}
      {pointing && onPoint && (
        <PointFix
          src={pointing.src}
          name={pointing.name}
          onClose={() => setPointing(null)}
          onDone={(text) => {
            onPoint(text);
            setPointing(null);
          }}
        />
      )}
      {items.length === 0 ? (
        emptyText && <p className="muted small">{emptyText}</p>
      ) : (
        <ol className="att-list">
          {items.map((a, i) => (
            <li key={a.id} className="att-item">
              {urls[a.id] && isRaster(a.mime) ? (
                // 사진은 팝업으로 크게(v0.4.91 소유자), 문서는 지금처럼 열기·내려받기
                <button type="button" className="att-zoom" onClick={() => setZoom({ src: urls[a.id]!, name: a.fileName })} aria-label={`${a.fileName} 크게 보기`}>
                  <Thumb src={urls[a.id]!} alt={a.fileName} mime={a.mime} />
                </button>
              ) : urls[a.id] && linkable(a.mime) ? (
                <a href={urls[a.id]!} target="_blank" rel="noreferrer" title="열기·내려받기">
                  <Thumb src={urls[a.id]!} alt={a.fileName} mime={a.mime} />
                </a>
              ) : (
                <Thumb src={null} alt={a.fileName} mime={a.mime} />
              )}
              <div className="att-body">
                <p className="att-name small">
                  {i + 1}. {a.fileName} <span className="muted">· {kb(a.sizeBytes)}</span>
                  {failed[a.id] && <span className="task-error"> · {failed[a.id]}</span>}
                </p>
                {editable ? (
                  <>
                    <RoleChips roles={rolesOf(roles, a.mime)} value={a.role} disabled={busy} onChange={(role) => void act(() => onUpdate!({ ...a, role }))} />
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
                {onPoint && urls[a.id] && isRaster(a.mime) && (
                  <button type="button" className="btn btn-small btn-ghost att-analyze" onClick={() => setPointing({ src: urls[a.id]!, name: a.fileName })}>
                    짚어서 수정
                  </button>
                )}
                {previewable(a.mime) && (
                  <button type="button" className="btn btn-small btn-ghost att-analyze" aria-expanded={!!previewOpen[a.id]} onClick={() => setPreviewOpen({ ...previewOpen, [a.id]: !previewOpen[a.id] })}>
                    {previewOpen[a.id] ? '미리보기 닫기' : '미리보기'}
                  </button>
                )}
                {!analyses?.get(a.id) &&
                  onAnalyze &&
                  !analyzeBlocker &&
                  canGeminiRead(a) && (
                    <button type="button" className="btn btn-small btn-ghost att-analyze" disabled={busy} onClick={() => void act(() => onAnalyze(a))}>
                      {isImage(a.mime) ? 'Gemini로 분석' : 'Gemini로 요약'}
                    </button>
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
              {/* 미리보기·요약은 좁은 칸 대신 이 줄 아래 전체 폭으로 */}
              {(previewOpen[a.id] || analyses?.get(a.id)) && (
                <div className="att-wide">
                  {previewOpen[a.id] && (
                    <FilePreview
                      name={a.fileName}
                      mime={a.mime}
                      openUrl={linkable(a.mime) ? urls[a.id] : null}
                      load={async () => {
                        const res = await fetch(urls[a.id] ?? (await urlFor(a)));
                        if (!res.ok) throw new Error(`파일을 받지 못했습니다(HTTP ${res.status}).`);
                        return res.blob();
                      }}
                    />
                  )}
                  {analyses?.get(a.id) && <AnalysisView analysis={analyses.get(a.id)!} doc={!isImage(a.mime)} />}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {blocker && items.length > 0 && <p className="muted small">{blocker}</p>}
      {onAnalyze && !analyzeBlocker && items.some((a) => !analyses?.get(a.id) && canGeminiRead(a)) && (
        <p className="muted small">"Gemini로 분석·요약"을 누르면 그 파일이 Google(Gemini 무료)로 갑니다. 개인정보·기밀이 담긴 파일은 보내지 마세요. 분석은 원본을 대신하지 않습니다. ZIP·SVG와 10MB 넘는 문서는 미리보기만 합니다(미리보기는 이 브라우저 안에서만, AI 사용 없음).</p>
      )}
      {!blocker && onAdd && items.length < max && (
        <DropZone
          disabled={busy}
          label={busy ? '올리는 중…' : allowDocs ? '이미지·문서 추가' : '이미지 추가'}
          allowDocs={allowDocs}
          onFiles={(list) =>
            void act(async () => {
              const { files, errors } = takeImages(list, max - items.length, allowDocs);
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

/** Gemini 분석 결과 보기. 보이는 것과 추정을 나눠 보여 준다. */
function AnalysisView({ analysis, doc }: { analysis: ImageAnalysis; doc: boolean }) {
  const b = analysis.analysis;
  // 문서 요약도 같은 칸을 쓴다: 핵심 내용 / 구성·요약 / 원문 인용 / 요청과의 관련
  const L = doc
    ? { obs: '문서에 적힌 핵심', ui: '구성·요약', text: '원문 인용', fit: '요청과의 관련', same: '같은 문서의 이전 요약', title: 'Gemini 요약 보기' }
    : { obs: '보이는 것', ui: '화면 구조', text: '글자', fit: '역할과 맞는지', same: '같은 이미지의 이전 분석', title: 'Gemini 분석 보기' };
  return (
    <details className="att-analysis">
      <summary className="small">
        {L.title} <span className="muted">· {analysis.keySlot === null ? L.same : analysis.model}</span>
      </summary>
      <dl className="small">
        {b.observations?.length > 0 && (
          <>
            <dt>{L.obs}</dt>
            <dd>{b.observations.join(' / ')}</dd>
          </>
        )}
        {b.ui_structure && (
          <>
            <dt>{L.ui}</dt>
            <dd>{b.ui_structure}</dd>
          </>
        )}
        {b.visible_text?.length > 0 && (
          <>
            <dt>{L.text}</dt>
            <dd>{b.visible_text.join(' / ')}</dd>
          </>
        )}
        {b.colors_layout && !doc && (
          <>
            <dt>색·배치</dt>
            <dd>{b.colors_layout}</dd>
          </>
        )}
        {b.role_fit && (
          <>
            <dt>{L.fit}</dt>
            <dd>{b.role_fit}</dd>
          </>
        )}
        {b.uncertainties?.length > 0 && (
          <>
            <dt>추정·불확실</dt>
            <dd>{b.uncertainties.join(' / ')}</dd>
          </>
        )}
        {b.raw && (
          <>
            <dt>형식 밖 답변</dt>
            <dd className="wf-pre">{b.raw}</dd>
          </>
        )}
      </dl>
    </details>
  );
}
