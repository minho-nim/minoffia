import type { OfficeStore } from '../data/store';
import type { Snapshot, Task } from '../domain/types';
import { deriveWorkflow } from '../domain/workflow';
import type { ResultReview } from '../domain/workflow-types';

type Context = {
  store: OfficeStore;
  snap: Snapshot;
  setSnap: (snap: Snapshot) => void;
  say: (kind: 'ok' | 'error', text: string) => void;
  requestRevision: (task: Task, feedback: string) => Promise<boolean>;
};
const RETRY_MS = 30_000;
const MAX_RETRY_MS = 300_000;
const WAIT_POLL_MS = 60_000;
const SERVER_FIRST_MS = 120_000;

/** 요청 중에만 잠그고, 실패하면 쉬었다 다시 시도한다. Claude 대기도 서버의 만료 판단을 주기적으로 확인한다. */
export function createResultReviewer(clock: () => number = Date.now) {
  const requests = new Map<string, { running: boolean; nextAt: number; failures: number }>();
  const waiting = new Set<string>();
  const redo = new Map<string, number>();
  const announce = (ctx: Context, task: Task, revision: number, rv: ResultReview) => {
    const score = rv.total === null ? '' : ` ${rv.total}점`;
    const message = rv.verdict === 'pass' ? '검토 통과. 확인하고 결과 승인하세요.'
      : rv.verdict === 'redo' ? `고칠 점이 있어 다시 개발을 보내요(자동 ${rv.autoRedo + 1}/2).`
      : '사장님 확인이 필요해요. 업무 카드의 점수표를 보세요.';
    ctx.say(rv.verdict === 'owner' ? 'error' : 'ok', `'${task.title}' 결과 v${revision} 평가${score}: ${message}`);
  };
  return {
    tick(ctx: Context) {
      for (const task of ctx.snap.tasks) {
        const view = deriveWorkflow(task, ctx.snap.workflow);
        const result = view.result;
        if (!result || view.bApproved || view.resultRevised) continue;
        const key = `${task.id}:${result.revision}`;
        const review = ctx.snap.workflow.reviews?.find((r) => r.taskId === task.id && r.resultRevision === result.revision);
        if (review) {
          requests.delete(key);
          if (waiting.delete(key)) announce(ctx, task, result.revision, review);
          // v0.6.12: 서버가 먼저 수정 요청·재계획을 보낸다. 앱은 2분 기다려도 수정 요청이 안 생겼을 때만(서버 실패) 대신 보낸다
          if (review.verdict === 'redo' && review.feedback && !redo.has(key)) redo.set(key, clock() + SERVER_FIRST_MS);
          if (review.verdict === 'redo' && review.feedback && (redo.get(key) ?? 0) <= clock()) {
            redo.set(key, Infinity);
            void ctx.requestRevision(task, review.feedback).then((ok) => {
              if (!ok) redo.set(key, clock() + RETRY_MS);
            }).catch(() => { redo.set(key, clock() + RETRY_MS); });
          }
          continue;
        }
        const state = requests.get(key) ?? { running: false, nextAt: 0, failures: 0 };
        if (state.running || state.nextAt > clock()) continue;
        state.running = true;
        requests.set(key, state);
        void ctx.store.reviewResult(task.id, result.revision).then(async (rv) => {
          if (typeof rv === 'string') {
            if (!waiting.has(key) && rv === 'started') ctx.say('ok', `'${task.title}' 결과 v${result.revision}을 Claude가 채점하고 있어요. 점수가 오면 알려 드려요.`);
            waiting.add(key);
            state.nextAt = clock() + WAIT_POLL_MS;
          } else {
            ctx.setSnap(await ctx.store.load());
            waiting.delete(key);
            announce(ctx, task, result.revision, rv);
            state.nextAt = Infinity;
          }
          state.failures = 0;
        }).catch((e: unknown) => {
          state.nextAt = clock() + Math.min(MAX_RETRY_MS, RETRY_MS * 2 ** state.failures++);
          ctx.say('error', `'${task.title}' 결과를 평가하지 못했어요: ${e instanceof Error ? e.message : String(e)} 잠시 뒤 다시 확인해요.`);
        }).finally(() => { state.running = false; });
      }
    },
  };
}
