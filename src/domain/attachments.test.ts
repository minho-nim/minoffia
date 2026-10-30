import { describe, expect, it } from 'vitest';
import { attachmentsOf, describeAttachments, fileNameFor, MAX_FILE_BYTES, moved, sha256OfBytes, validateFile, type Attachment } from './attachments';

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
