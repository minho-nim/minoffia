import { describe, expect, it } from 'vitest';
import { CHAT_INLINE_MIMES, chatFileKind, defaultAsk, docText, MAX_CHAT_FILES, MAX_CHAT_INLINE_BYTES, pickChatFiles, utf8Base64 } from './chatDocs';

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });

describe('채팅 문서 첨부', () => {
  it('사진·PDF·글·Office를 구분하고 ZIP·SVG는 받지 않는다', () => {
    expect(chatFileKind({ name: 'a.png', type: 'image/png' })).toBe('image');
    expect(chatFileKind({ name: 'a.pdf', type: 'application/pdf' })).toBe('pdf');
    expect(chatFileKind({ name: 'a.md', type: '' })).toBe('text');
    expect(chatFileKind({ name: 'a.csv', type: 'application/vnd.ms-excel' })).toBe('text');
    expect(chatFileKind({ name: 'a.docx', type: '' })).toBe('office');
    expect(chatFileKind({ name: 'a.zip', type: 'application/zip' })).toBeNull();
    expect(chatFileKind({ name: 'a.svg', type: 'image/svg+xml' })).toBeNull();
    // 확장자와 형식이 다르면 받지 않는다
    expect(chatFileKind({ name: 'a.pdf', type: 'text/html' })).toBeNull();
  });

  it('개수·사진 장수·합계 크기를 막는다', () => {
    const many = Array.from({ length: 6 }, (_, i) => file(`d${i}.txt`, 'text/plain'));
    const r = pickChatFiles([], many);
    expect(r.ok).toHaveLength(MAX_CHAT_FILES);
    expect(r.error).toContain('5개');
    const pics = pickChatFiles([], Array.from({ length: 4 }, (_, i) => file(`p${i}.png`, 'image/png')));
    expect(pics.ok).toHaveLength(3);
    const big = pickChatFiles([file('a.pdf', 'application/pdf', 5 * 1024 * 1024)], [file('b.pdf', 'application/pdf', 4 * 1024 * 1024)]);
    expect(big.ok).toHaveLength(0);
    expect(big.error).toContain('8MB');
    // 글 문서는 뽑은 글만 가므로 PDF 합계에 넣지 않는다
    expect(pickChatFiles([file('a.pdf', 'application/pdf', MAX_CHAT_INLINE_BYTES - 10)], [file('b.txt', 'text/plain', 1000)]).ok).toHaveLength(1);
    expect(pickChatFiles([], [file('x.exe', 'application/octet-stream')]).error).toContain('x.exe');
  });

  it('보낼 글은 이름 머리말을 붙이고 길면 자른다', () => {
    expect(docText('a.txt', 'hi\r\nthere')).toBe('[첨부 파일: a.txt]\nhi\nthere');
    const t = docText('b.txt', 'x'.repeat(20), 10);
    expect(t).toContain('앞 10자만');
    expect(t.endsWith('x'.repeat(10))).toBe(true);
  });

  it('한글을 UTF-8 base64로 바꾼다', () => {
    const b = utf8Base64('안녕 문서');
    expect(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)))).toBe('안녕 문서');
  });

  it('질문이 비면 첨부 종류에 맞게 묻는다', () => {
    expect(defaultAsk(['image'])).toBe('이 사진 설명해 줘');
    expect(defaultAsk(['pdf'])).toBe('이 문서 요약해 줘');
    expect(defaultAsk(['image', 'office'])).toContain('사진과 문서');
  });

  it('서버 ask-gemini와 형식·상한이 같다', async () => {
    const src = (await import('../../supabase/functions/ask-gemini/index.ts?raw')).default as string;
    for (const m of CHAT_INLINE_MIMES) expect(src).toContain(`'${m}'`);
    expect(src).toContain(`const MAX_INLINE = ${MAX_CHAT_FILES};`);
    expect(src).toContain(`const MAX_INLINE_BYTES = ${MAX_CHAT_INLINE_BYTES / 1024 / 1024} * 1024 * 1024;`);
  });
});
