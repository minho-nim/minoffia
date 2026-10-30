import { useEffect, useState } from 'react';
import { MIME_EXT, previewKind } from '../domain/attachments';
import { extractOffice, OFFICE_KIND, type OfficeText } from '../../supabase/functions/analyze-image/office';

/**
 * 첨부 미리보기(AI 호출 없음, 브라우저 안에서만).
 * - HTML은 스크립트가 막힌 격리 창(sandbox)에서, SVG는 <img>로(스크립트 실행 안 됨) 보여 준다.
 * - DOCX·XLSX·PPTX는 ZIP 안의 XML에서 글·표·슬라이드 글만 뽑는다. ZIP은 목록을 보고 안의 파일을 같은 방식으로 연다.
 * ZIP을 여는 라이브러리(jszip)는 미리보기를 열 때만 불러온다.
 */

/** 글 미리보기 상한(앞부분만) */
const MAX_TEXT = 200_000;
/** ZIP 안 파일 하나를 열 수 있는 크기(압축 푼 크기) */
const MAX_ENTRY = 20 * 1024 * 1024;
const MAX_ENTRIES = 500;

const EXT_MIME: Record<string, string> = Object.fromEntries([...Object.entries(MIME_EXT).map(([m, e]) => [e, m]), ['jpeg', 'image/jpeg'], ['htm', 'text/html'], ['js', 'text/plain'], ['ts', 'text/plain'], ['tsx', 'text/plain'], ['jsx', 'text/plain'], ['css', 'text/plain'], ['xml', 'text/plain'], ['yml', 'text/plain'], ['yaml', 'text/plain']]);
const mimeOfName = (name: string) => EXT_MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

type ZipEntry = { name: string; size: number | null; open: () => Promise<Blob> };
type View =
  | { kind: 'img'; url: string }
  | { kind: 'html'; source: string; cut: boolean }
  | { kind: 'text'; text: string; cut: boolean }
  | { kind: 'pdf'; url: string }
  | { kind: 'office'; office: OfficeText }
  | { kind: 'zip'; entries: ZipEntry[]; more: number };

const loadZip = async (blob: Blob) => {
  const { default: JSZip } = await import('jszip');
  return JSZip.loadAsync(await blob.arrayBuffer());
};

async function makeView(blob: Blob, mime: string): Promise<View> {
  const kind = previewKind(mime);
  if (kind === 'image') return { kind: 'img', url: URL.createObjectURL(blob) };
  // SVG는 저장소에서 글(text/plain)로 내려오므로 형식을 다시 붙여 <img>로만 그린다.
  if (kind === 'svg') return { kind: 'img', url: URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'image/svg+xml' })) };
  if (kind === 'pdf') return { kind: 'pdf', url: URL.createObjectURL(new Blob([await blob.arrayBuffer()], { type: 'application/pdf' })) };
  if (kind === 'html' || kind === 'text') {
    const t = await blob.text();
    const cut = t.length > MAX_TEXT;
    return kind === 'html' ? { kind: 'html', source: t.slice(0, MAX_TEXT), cut } : { kind: 'text', text: t.slice(0, MAX_TEXT), cut };
  }
  if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx') {
    return { kind: 'office', office: await extractOffice((await loadZip(blob)) as never, OFFICE_KIND[mime]) };
  }
  if (kind === 'zip') {
    const zip = await loadZip(blob);
    const files = Object.values(zip.files).filter((f) => !f.dir);
    return {
      kind: 'zip',
      more: Math.max(0, files.length - MAX_ENTRIES),
      entries: files
        .slice(0, MAX_ENTRIES)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => ({
          name: f.name,
          // 압축 푼 크기(JSZip 내부 값, 없으면 모름)
          size: (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? null,
          open: () => f.async('blob'),
        })),
    };
  }
  throw new Error('이 형식은 미리보기를 지원하지 않습니다.');
}

/** openUrl: 저장된 파일의 실제 주소(만료됨). PDF를 새 탭에서 열 때 쓴다(휴대폰은 blob: 주소를 새 탭으로 못 여는 경우가 있다). */
export function FilePreview({ name, mime, load, openUrl }: { name: string; mime: string; load: () => Promise<Blob>; openUrl?: string | null }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let made: View | null = null;
    load()
      .then((blob) => makeView(blob, mime))
      .then((v) => {
        made = v;
        if (alive) setView(v);
      })
      .catch((e: Error) => alive && setError(e.message || '미리보기를 만들지 못했습니다.'));
    return () => {
      alive = false;
      if (made && (made.kind === 'img' || made.kind === 'pdf')) URL.revokeObjectURL(made.url);
    };
    // 파일이 바뀔 때만 다시 만든다.
  }, [name, mime]);

  if (error) return <p className="task-error small">미리보기 실패: {error}</p>;
  if (!view) return <p className="muted small">미리보기를 만드는 중…</p>;

  return (
    <div className="preview">
      {view.kind === 'img' && <img className="preview-img" src={view.url} alt={name} />}
      {view.kind === 'pdf' && (
        <>
          <iframe className="preview-frame" src={view.url} title={name} />
          <a className="btn btn-small btn-ghost" href={openUrl || view.url} target="_blank" rel="noreferrer">
            PDF 크게 보기(새 탭)
          </a>
          <p className="muted small">휴대폰에서는 위 창이 비어 보일 수 있어요. 그때는 "PDF 크게 보기"를 누르세요.</p>
        </>
      )}
      {view.kind === 'html' && (
        <>
          {/* sandbox에 아무 권한도 주지 않는다: 스크립트·폼·팝업·같은 출처 접근 모두 막힘 */}
          <iframe className="preview-frame" sandbox="" srcDoc={view.source} title={`${name} 미리보기(스크립트 꺼짐)`} />
          <p className="muted small">스크립트를 끈 채 보여 줍니다. 움직임·외부 이미지는 다를 수 있습니다.</p>
          <details>
            <summary className="small">코드 보기</summary>
            <pre className="preview-text">{view.source}</pre>
          </details>
          {view.cut && <p className="muted small">앞 20만 자만 보여 줍니다.</p>}
        </>
      )}
      {view.kind === 'text' && (
        <>
          <pre className="preview-text">{view.text}</pre>
          {view.cut && <p className="muted small">앞 20만 자만 보여 줍니다.</p>}
        </>
      )}
      {view.kind === 'office' && <OfficeView office={view.office} />}
      {view.kind === 'zip' && <ZipView entries={view.entries} more={view.more} />}
    </div>
  );
}

function OfficeView({ office }: { office: OfficeText }) {
  const [sheet, setSheet] = useState(0);
  if (office.kind === 'docx') {
    const lines = office.lines ?? [];
    return (
      <div className="preview-doc">
        {lines.length === 0 && <p className="muted small">글이 없습니다(그림만 있는 문서일 수 있음).</p>}
        {lines.map((l, i) => {
          const h = l.match(/^(#{1,6}) (.*)$/);
          return h ? (
            <p key={i} className="preview-h">
              {h[2]}
            </p>
          ) : (
            <p key={i}>{l || ' '}</p>
          );
        })}
      </div>
    );
  }
  if (office.kind === 'pptx') {
    return (
      <ol className="preview-slides">
        {(office.slides ?? []).map((s, i) => (
          <li key={i}>
            <span className="muted small">슬라이드 {i + 1}</span>
            <pre className="preview-text">{s || '(글 없음)'}</pre>
          </li>
        ))}
      </ol>
    );
  }
  const sheets = office.sheets ?? [];
  const cur = sheets[Math.min(sheet, sheets.length - 1)];
  return (
    <div>
      {sheets.length > 1 && (
        <div className="preview-tabs" role="tablist" aria-label="시트">
          {sheets.map((s, i) => (
            <button key={s.name + i} type="button" role="tab" aria-selected={i === sheet} className="chip" onClick={() => setSheet(i)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {cur && (
        <div className="preview-table-wrap">
          <table className="preview-table">
            <tbody>
              {cur.rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}</th>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {cur.truncated && <p className="muted small">앞 200행·50열만 보여 줍니다.</p>}
        </div>
      )}
    </div>
  );
}

function ZipView({ entries, more }: { entries: ZipEntry[]; more: number }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <p className="muted small">
        파일 {entries.length + more}개{more ? ` (앞 ${entries.length}개만 표시)` : ''}. 눌러서 안의 파일을 미리 봅니다.
      </p>
      <ul className="preview-zip">
        {entries.map((e) => {
          const mime = mimeOfName(e.name);
          const can = !!mime && !!previewKind(mime) && (e.size === null || e.size <= MAX_ENTRY);
          return (
            <li key={e.name}>
              {can ? (
                <button type="button" className="link-btn small mono" aria-expanded={open === e.name} onClick={() => setOpen(open === e.name ? null : e.name)}>
                  {e.name}
                </button>
              ) : (
                <span className="small mono">{e.name}</span>
              )}
              {e.size !== null && <span className="muted small"> · {kb(e.size)}</span>}
              {open === e.name && can && <FilePreview name={e.name} mime={mime} load={e.open} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
