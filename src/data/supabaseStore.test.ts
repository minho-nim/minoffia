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
    expect(handlers.size).toBe(23);
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
