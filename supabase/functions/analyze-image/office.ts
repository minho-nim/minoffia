// DOCX·XLSX·PPTX 글 뽑기(외부 의존 없음: 브라우저 미리보기와 Deno 함수가 같이 쓴다).
// 세 형식 모두 ZIP 안의 XML이다. ZIP을 여는 쪽(JSZip)은 호출하는 곳이 넘겨준다.
// 서식·그림은 버리고 글·표·슬라이드 순서만 남긴다(미리보기와 Gemini 요약용).

/** JSZip과 같은 모양의 최소 인터페이스 */
export interface ZipLike {
  files: Record<string, { dir: boolean }>;
  file(name: string): { async(type: 'string'): Promise<string> } | null;
}

export type OfficeKind = 'docx' | 'xlsx' | 'pptx';

export interface OfficeText {
  kind: OfficeKind;
  /** docx: 문단·표 줄 */
  lines?: string[];
  /** pptx: 슬라이드별 글 */
  slides?: string[];
  /** xlsx: 시트별 앞부분 */
  sheets?: { name: string; rows: string[][]; truncated: boolean }[];
}

export const OFFICE_KIND: Record<string, OfficeKind> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

/** 미리보기·요약 상한 */
export const MAX_SHEETS = 10;
export const MAX_ROWS = 200;
export const MAX_COLS = 50;
export const MAX_SLIDES = 200;

export function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

const read = async (zip: ZipLike, name: string) => (await zip.file(name)?.async('string')) ?? null;
const num = (name: string) => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);

const runs = (p: string) => [...p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');

/** DOCX 본문: 문단은 줄, 표는 한 행을 한 줄로(칸은 ' | ') */
export function docxLines(xml: string): string[] {
  const body = xml
    .replace(/^[\s\S]*?<w:body[^>]*>/, '')
    .replace(/<w:sectPr[\s\S]*$/, '')
    // 태그 사이 들여쓰기 공백은 글이 아니다(글은 <w:t> 안에만 있다).
    .replace(/>\s+</g, '><')
    .trim();
  const text = body
    .replace(/<w:tab\/>/g, '<w:t>\t</w:t>')
    .replace(/<w:br[^>]*\/>/g, '<w:t> </w:t>')
    // 표 칸 안의 문단은 줄을 바꾸지 않고 한 칸으로 합친다.
    .replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => `${[...tc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) => runs(p[0])).filter(Boolean).join(' ')} | `)
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g, (p) => {
      const heading = p.match(/<w:pStyle w:val="(?:Heading|제목)\s?(\d)"/i);
      const list = /<w:numPr>/.test(p);
      const inner = runs(p);
      const prefix = heading ? `${'#'.repeat(Math.min(Number(heading[1]), 6))} ` : list ? '- ' : '';
      return inner ? `${prefix}${inner}\n` : '\n';
    })
    .replace(/<[^>]+>/g, '');
  const lines = decodeXml(text)
    .split('\n')
    .map((l) => l.replace(/ \| $/, '').trimEnd())
    .filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** PPTX 슬라이드 하나의 글(문단마다 줄) */
export function slideText(xml: string): string {
  const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) =>
    [...p[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(''),
  );
  return paras.filter((p) => p.trim() !== '').join('\n');
}

/** XLSX 공유 문자열 */
export function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) => [...si[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(''));
}

const colIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** XLSX 시트 하나: 앞 MAX_ROWS행 × MAX_COLS열 값 */
export function sheetRows(xml: string, strings: string[]): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let truncated = false;
  for (const r of xml.matchAll(/<row[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const row: string[] = [];
    for (const c of (r[1] ?? '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1] ?? '';
      const i = ref ? colIndex(ref) : row.length;
      if (i >= MAX_COLS) {
        truncated = true;
        continue;
      }
      const type = attrs.match(/t="(\w+)"/)?.[1] ?? '';
      const inner = c[2] ?? '';
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') value = [...inner.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join('');
      else if (type === 'b' && v !== undefined) value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) value = decodeXml(v);
      while (row.length < i) row.push('');
      row[i] = value;
    }
    rows.push(row);
  }
  // 뒤쪽 빈 행은 버린다.
  while (rows.length && rows[rows.length - 1].every((x) => x === '')) rows.pop();
  return { rows, truncated };
}

/** ZIP으로 연 DOCX·XLSX·PPTX에서 글을 뽑는다. 형식이 맞지 않으면 오류 */
export async function extractOffice(zip: ZipLike, kind: OfficeKind): Promise<OfficeText> {
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (kind === 'docx') {
    const xml = await read(zip, 'word/document.xml');
    if (xml === null) throw new Error('DOCX 본문(word/document.xml)이 없습니다.');
    return { kind, lines: docxLines(xml) };
  }
  if (kind === 'pptx') {
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b)).slice(0, MAX_SLIDES);
    if (!slides.length) throw new Error('PPTX 슬라이드가 없습니다.');
    return { kind, slides: await Promise.all(slides.map(async (n) => slideText((await read(zip, n)) ?? ''))) };
  }
  const workbook = await read(zip, 'xl/workbook.xml');
  if (workbook === null) throw new Error('XLSX 통합 문서(xl/workbook.xml)가 없습니다.');
  const strings = sharedStrings((await read(zip, 'xl/sharedStrings.xml')) ?? '');
  // 시트 이름 → 파일(관계 파일로 찾고, 없으면 순서대로)
  const rels = (await read(zip, 'xl/_rels/workbook.xml.rels')) ?? '';
  const target = new Map([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheets = [...workbook.matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g)].slice(0, MAX_SHEETS);
  const out: NonNullable<OfficeText['sheets']> = [];
  for (const [i, s] of sheets.entries()) {
    const t = target.get(s[2]);
    const path = t ? `xl/${t.replace(/^\/?xl\//, '').replace(/^\//, '')}` : `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await read(zip, path);
    if (xml === null) continue;
    out.push({ name: decodeXml(s[1]), ...sheetRows(xml, strings) });
  }
  if (!out.length) throw new Error('XLSX 시트를 읽지 못했습니다.');
  return { kind, sheets: out };
}

/** Gemini 요약용 글(길이 상한) */
export function officeToText(o: OfficeText, maxChars = 200_000): string {
  let text = '';
  if (o.kind === 'docx') text = (o.lines ?? []).join('\n');
  else if (o.kind === 'pptx') text = (o.slides ?? []).map((s, i) => `## 슬라이드 ${i + 1}\n${s}`).join('\n\n');
  else text = (o.sheets ?? []).map((s) => `## 시트: ${s.name}${s.truncated ? ' (앞부분만)' : ''}\n${s.rows.map((r) => r.join('\t')).join('\n')}`).join('\n\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(뒤는 잘림)` : text;
}
