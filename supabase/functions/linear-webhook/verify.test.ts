import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commentIssueId, fresh, signatureOk } from './verify';

describe('Linear 웹훅(v0.5.3)', () => {
  it('서명이 맞을 때만 받는다', async () => {
    const raw = '{"type":"Comment"}';
    const sig = createHmac('sha256', 's3cret').update(raw).digest('hex');
    expect(await signatureOk(raw, sig, 's3cret')).toBe(true);
    expect(await signatureOk(raw, sig, 'other')).toBe(false);
    expect(await signatureOk(raw + ' ', sig, 's3cret')).toBe(false);
    expect(await signatureOk(raw, '', 's3cret')).toBe(false);
  });
  it('1분 넘은 요청은 받지 않는다', () => {
    expect(fresh(1_000_000, 1_030_000)).toBe(true);
    expect(fresh(1_000_000, 1_070_001)).toBe(false);
    expect(fresh('x', 1)).toBe(false);
  });
  it('댓글 생성만 본다', () => {
    expect(commentIssueId({ type: 'Comment', action: 'create', data: { issueId: 'i1' } })).toBe('i1');
    expect(commentIssueId({ type: 'Comment', action: 'update', data: { issueId: 'i1' } })).toBeNull();
    expect(commentIssueId({ type: 'Issue', action: 'create', data: {} })).toBeNull();
  });
  it('Codex 소식 읽기는 codex-linear와 같은 파일', () => {
    expect(readFileSync('supabase/functions/linear-webhook/linear.ts', 'utf8')).toBe(readFileSync('supabase/functions/codex-linear/linear.ts', 'utf8'));
  });
});
