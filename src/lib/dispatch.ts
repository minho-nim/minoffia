import type { SupabaseClient } from '@supabase/supabase-js';

export interface DispatchResult {
  ok: boolean;
  sessionUrl?: string | null;
  error?: string;
}

/** Edge Function에 Claude Cloud Routine 실행을 요청한다. 토큰은 서버에만 있다. */
export async function dispatchClaude(
  client: SupabaseClient,
  taskId: string,
  acknowledgeRetry: boolean,
): Promise<DispatchResult> {
  const { data, error } = await client.functions.invoke('dispatch-claude', {
    body: { taskId, acknowledgeRetry },
  });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      } catch {
        // 본문이 JSON이 아니면 기본 메시지 사용
      }
    }
    return { ok: false, error: message };
  }
  return { ok: Boolean(data?.ok), sessionUrl: data?.sessionUrl ?? null, error: data?.error };
}
