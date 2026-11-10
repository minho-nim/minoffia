import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { startable } from './autoRun';

const a = (id: string, status: string, assignee = 'codex') => ({ id, work_item_id: id, assignee, execution_mode: 'manual_handoff', dispatch_status: status });

describe('앱을 닫아 둬도 진행(v0.6.28)', () => {
  it('실행 승인된 준비 작업 중 앞 작업이 끝난 것만 시작', () => {
    const items = [{ id: 'W1' }, { id: 'W2', dependencies: ['W1'] }, { id: 'W3', dependencies: ['W1'] }];
    const ok = new Set(['W1', 'W2', 'W3']);
    expect(startable(items, [a('W1', 'ready'), a('W2', 'ready'), a('W3', 'ready')], ok).map((x) => x.id)).toEqual(['W1']);
    expect(startable(items, [a('W1', 'completed'), a('W2', 'ready'), a('W3', 'started')], ok).map((x) => x.id)).toEqual(['W2']);
  });
  it('실행 승인 없거나 Gemini 개발이면 서버가 시작하지 않는다', () => {
    expect(startable([{ id: 'W1' }], [a('W1', 'ready')], new Set())).toEqual([]);
    expect(startable([{ id: 'W1' }], [a('W1', 'ready', 'gemini')], new Set(['W1']))).toEqual([]);
  });
  it('submit-result·linear-webhook의 복사본과 같다', () => {
    expect(readFileSync('supabase/functions/submit-result/autoRun.ts', 'utf8')).toBe(readFileSync('supabase/functions/submit-plan/autoRun.ts', 'utf8'));
    expect(readFileSync('supabase/functions/linear-webhook/autoRun.ts', 'utf8')).toBe(readFileSync('supabase/functions/submit-plan/autoRun.ts', 'utf8'));
  });
});
