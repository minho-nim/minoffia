import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseStore } from './supabaseStore';

describe('실시간 구독(v0.3.7)', () => {
  it('업무 표들의 변경을 듣고, 끊으면 채널을 지운다', () => {
    const handlers = new Map<string, () => void>();
    let subscribed = false;
    let removed = false;
    const channel = {
      on(_type: string, filter: { table: string }, cb: () => void) {
        handlers.set(filter.table, cb);
        return channel;
      },
      subscribe() {
        subscribed = true;
        return channel;
      },
    };
    const client = {
      channel: () => channel,
      removeChannel: async () => {
        removed = true;
      },
    } as unknown as SupabaseClient;
    const store = createSupabaseStore(client);
    const seen: string[] = [];
    const off = store.subscribe!((t) => seen.push(t));
    expect(subscribed).toBe(true);
    expect([...handlers.keys()]).toEqual(expect.arrayContaining(['tasks', 'approvals', 'attachments', 'inbox_state', 'deployments']));
    // 대화 기록·AI 호출 기록은 실시간으로 퍼뜨리지 않는다
    expect(handlers.has('chat_messages')).toBe(false);
    expect(handlers.size).toBe(24);
    handlers.get('approvals')!();
    expect(seen).toEqual(['approvals']);
    off();
    expect(removed).toBe(true);
  });
});

describe('계획과 배정의 원자적 저장', () => {
  it('두 번의 INSERT 대신 한 RPC로 전체 배정을 보낸다', async () => {
    const { vi } = await import('vitest');
    const { preparePlanImport } = await import('../workflow/planImport');
    const { task, planText, snapshot } = await import('../workflow/fixtures.test-helper');
    const p = preparePlanImport(task, planText, 'gemini_fallback', snapshot(), 1);
    if (!('plan' in p)) throw new Error('계획 준비 실패');
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn();
    const store = createSupabaseStore({ rpc, from } as unknown as SupabaseClient);
    await store.addPlan(p.plan, p.assignments);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_pm_plan', expect.objectContaining({
      p_plan: expect.objectContaining({ task_id: task.id, approved_spec_revision: 1 }),
      p_assignments: [expect.objectContaining({ work_item_id: 'W1', assignee: 'codex' })],
    }));
    expect(from).not.toHaveBeenCalled();
  });
  it('RPC가 실패하면 저장 성공으로 처리하지 않는다', async () => {
    const { vi } = await import('vitest');
    const { preparePlanImport } = await import('../workflow/planImport');
    const { task, planText, snapshot } = await import('../workflow/fixtures.test-helper');
    const p = preparePlanImport(task, planText, 'gemini_fallback', snapshot(), 1);
    if (!('plan' in p)) throw new Error('계획 준비 실패');
    const rpc = vi.fn().mockResolvedValue({ error: { message: '배정 저장 실패' } });
    const store = createSupabaseStore({ rpc } as unknown as SupabaseClient);
    await expect(store.addPlan(p.plan, p.assignments)).rejects.toThrow('배정 저장 실패');
  });
});

describe('배정 상태 기록(v0.5.33 버그: 서버가 시작한 작업을 앱이 못 바꿈)', () => {
  it('서버 확인 표시가 붙은 작업도 앱이 바꿀 때는 사용자 기록으로 보낸다(DB 보호 규칙이 server_verified를 막음)', async () => {
    const { vi } = await import('vitest');
    const sent: Record<string, unknown>[] = [];
    const eq = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: () => ({ update: (row: Record<string, unknown>) => (sent.push(row), { eq }) }),
    } as unknown as SupabaseClient;
    const store = createSupabaseStore(client);
    await store.updateAssignment({
      id: 'a1', taskId: 't1', planRevision: 1, workItemId: 'W1', title: '', assignee: 'gemini', executionMode: 'gemini_actions',
      dispatchStatus: 'completed', statusSource: 'server_verified', providerExecutionId: null, providerTaskUrl: null,
      actualProviderStatus: 'session_reported_result', startedAt: null, lastVerifiedAt: '2026-11-05T00:00:00Z', updatedAt: '',
    });
    expect(sent[0]).toMatchObject({ dispatch_status: 'completed', status_source: 'user_reported' });
    expect(sent[0]).not.toHaveProperty('last_verified_at');
  });
});
