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
    expect(handlers.size).toBe(19);
    handlers.get('approvals')!();
    expect(seen).toEqual(['approvals']);
    off();
    expect(removed).toBe(true);
  });
});
