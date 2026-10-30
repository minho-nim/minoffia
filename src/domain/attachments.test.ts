import { describe, expect, it } from 'vitest';
import { attachmentsOf, canGeminiRead, describeAttachments, docMime, fileNameFor, MAX_FILE_BYTES, moved, rolesFor, sha256OfBytes, validateFile, type Attachment } from './attachments';

const att = (id: string, position: number, extra: Partial<Attachment> = {}): Attachment => ({
  id,
  taskId: 't1',
  kind: 'request',
  resultRevision: null,
  position,
  role: 'current',
  note: '',
  fileName: `${id}.png`,
  mime: 'image/png',
  sizeBytes: 10,
  sha256: id,
  storagePath: `local:${id}`,
  createdAt: '2026-10-29T00:00:00Z',
  ...extra,
});

describe('validateFile', () => {
  it('이미지 형식·확장자·크기를 확인한다', () => {
    expect(validateFile({ name: 'a.png', type: 'image/png', size: 100 })).toBeNull();
    expect(validateFile({ name: 'a.pdf', type: 'application/pdf', size: 100 })).toContain('이미지만');
    expect(validateFile({ name: 'a.png', type: 'image/jpeg', size: 100 })).toContain('확장자');
    expect(validateFile({ name: 'a.png', type: 'image/png', size: MAX_FILE_BYTES + 1 })).toContain('5MB');
    expect(validateFile({ name: 'a.png', type: 'image/png', size: 0 })).toContain('빈 파일');
  });

  it('붙여넣은 이미지(확장자 없음)도 받고 이름을 붙인다', () => {
    expect(validateFile({ name: 'image', type: 'image/png', size: 100 })).toBeNull();
    expect(fileNameFor('', 'image/webp', 1)).toBe('image-2.webp');
    expect(fileNameFor('a/b:c.png', 'image/png', 0)).toBe('a_b_c.png');
  });
});

describe('attachmentsOf · moved', () => {
  it('묶음별로 순서대로 고르고, 한 칸씩 옮긴다', () => {
    const list = [att('b', 1), att('a', 0), att('r', 0, { kind: 'result', resultRevision: 2 }), att('x', 0, { taskId: 't2' })];
    expect(attachmentsOf(list, 't1', 'request').map((a) => a.id)).toEqual(['a', 'b']);
    expect(attachmentsOf(list, 't1', 'result', 2).map((a) => a.id)).toEqual(['r']);
    expect(attachmentsOf(list, 't1', 'result', 1)).toEqual([]);
    const next = moved(attachmentsOf(list, 't1', 'request'), 'b', -1);
    expect(next.map((a) => [a.id, a.position])).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
    expect(moved(next, 'b', -1)).toBe(next);
  });
});

describe('describeAttachments', () => {
  it('사용자가 적은 역할·설명만 쓴다', () => {
    const text = describeAttachments([att('aaaaaaaa1', 0, { note: '버튼이 잘림' }), att('bbbbbbbb2', 1, { role: 'target' })]);
    expect(text).toContain('1. [현재 화면] aaaaaaaa1.png — 버튼이 잘림 (첨부 aaaaaaaa)');
    expect(text).toContain('2. [목표·참고 디자인]');
    expect(describeAttachments([])).toBe('');
  });
});

describe('sha256OfBytes', () => {
  it('같은 내용은 같은 해시', async () => {
    const a = await sha256OfBytes(new TextEncoder().encode('abc').buffer as ArrayBuffer);
    expect(a).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

import { geminiAdapter } from './adapters';
describe('geminiAdapter', () => {
  it('실제 호출 기록으로 연결 상태를 정한다', () => {
    expect(geminiAdapter([], false).state).toBe('not_connected');
    expect(geminiAdapter([], true).state).toBe('not_verified');
    expect(geminiAdapter([{ ok: false, createdAt: '2026-10-30T00:00:00Z' }], true).reason).toContain('성공한 기록이 없다');
    const ok = geminiAdapter([{ ok: true, createdAt: '2026-10-30T01:00:00Z' }], true);
    expect(ok.state).toBe('verified');
    expect(ok.checkedAt).toBe('2026-10-30');
  });
});

describe('문서 첨부(v0.3.2)', () => {
  const f = (name: string, type: string, size = 1000) => ({ name, type, size });

  it('요청 자료는 문서를 받고, 형식은 확장자 기준으로 맞춘다', () => {
    expect(validateFile(f('spec.pdf', 'application/pdf'), true)).toBeNull();
    expect(validateFile(f('a.zip', 'application/x-zip-compressed'), true)).toBeNull();
    expect(validateFile(f('a.csv', 'application/vnd.ms-excel'), true)).toBeNull();
    expect(validateFile(f('notes.md', ''), true)).toBeNull();
    expect(docMime(f('a.zip', 'application/x-zip-compressed'))).toBe('application/zip');
    expect(docMime(f('notes.md', ''))).toBe('text/markdown');
  });

  it('위험하거나 모르는 형식, 확장자와 다른 형식은 거절', () => {
    expect(validateFile(f('a.html', 'text/html'), true)).toContain('문서');
    expect(validateFile(f('a.exe', 'application/octet-stream'), true)).not.toBeNull();
    expect(validateFile(f('a.pdf', 'text/html'), true)).not.toBeNull();
    expect(validateFile(f('a.svg', 'image/svg+xml'), true)).not.toBeNull();
  });

  it('문서는 20MB, 이미지는 5MB', () => {
    expect(validateFile(f('a.pdf', 'application/pdf', 20 * 1024 * 1024), true)).toBeNull();
    expect(validateFile(f('a.pdf', 'application/pdf', 20 * 1024 * 1024 + 1), true)).toContain('20MB');
    expect(validateFile(f('a.png', 'image/png', 5 * 1024 * 1024 + 1), true)).toContain('5MB');
  });

  it('결과 스크린샷 자리(allowDocs=false)는 이미지만', () => {
    expect(validateFile(f('spec.pdf', 'application/pdf'))).toContain('이미지만');
  });

  it('역할: 문서는 document 하나, Gemini는 이미지와 10MB 이하 PDF·글만', () => {
    expect(rolesFor('request', 'application/pdf')).toEqual(['document']);
    expect(rolesFor('request', 'image/png')).toContain('current');
    expect(canGeminiRead({ mime: 'application/pdf', sizeBytes: 1000 })).toBe(true);
    expect(canGeminiRead({ mime: 'application/pdf', sizeBytes: 11 * 1024 * 1024 })).toBe(false);
    expect(canGeminiRead({ mime: 'application/zip', sizeBytes: 1000 })).toBe(false);
  });
});
