/**
 * 챗봇 답 그리기용 간단한 마크다운 읽기(v0.7.99 소유자 "챗봇형"): 굵게·기울임·코드·링크·제목·목록·표·코드 블록.
 * HTML은 해석하지 않고 글자 그대로 둔다(화면은 React 글자로만 그린다 → 스크립트가 끼어들 수 없음).
 */
export type Inline = { t: 'text' | 'b' | 'i' | 'code'; v: string } | { t: 'link'; v: string; href: string };
export type Block =
  | { t: 'p'; v: Inline[] }
  | { t: 'h'; level: number; v: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'quote'; v: Inline[] }
  | { t: 'hr' };

/** 한 줄 안의 꾸밈 */
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    const x = m[0];
    if (m[1]) out.push({ t: 'code', v: x.slice(1, -1) });
    else if (m[2]) out.push({ t: 'b', v: x.slice(2, -2) });
    else if (m[3]) out.push({ t: 'link', v: x.slice(1, x.indexOf('](')), href: m[4] });
    else out.push({ t: 'i', v: x.slice(1, -1) });
    last = m.index + x.length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));

/** 글 전체 → 덩어리들 */
export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', v: inline(para.join('\n')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```(\S*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      out.push({ t: 'code', lang: fence[1], v: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ t: 'h', level: h[1].length, v: inline(h[2]) });
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flush();
      out.push({ t: 'hr' });
      continue;
    }
    // 표: | a | b | 다음 줄이 |---|---|
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ t: 'table', head, rows });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const items: Inline[][] = [];
      for (; i < lines.length; i++) {
        const m = kind === 'ul' ? /^\s*[-*•]\s+(.*)$/.exec(lines[i]) : /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(inline(m[1]));
      }
      i--;
      out.push(kind === 'ul' ? { t: 'ul', items } : { t: 'ol', items });
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flush();
      out.push({ t: 'quote', v: inline(q[1]) });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}
