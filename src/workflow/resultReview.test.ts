import { describe, expect, it, vi } from 'vitest';
import type { OfficeStore } from '../data/store';
import { createResultReviewer } from './resultReview';
import { passReview, snapshot } from './fixtures.test-helper';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function context() {
  const snap = snapshot();
  const reviewResult = vi.fn().mockResolvedValue(passReview);
  const load = vi.fn().mockResolvedValue(snap);
  return { store: { reviewResult, load } as unknown as OfficeStore, reviewResult, load, snap, setSnap: vi.fn(), say: vi.fn(), requestRevision: vi.fn().mockResolvedValue(true) };
}
describe('결과 채점 재시도', () => {
  it('실패해도 영구 잠그지 않고 30초 뒤 한 번만 재시도한다', async () => {
    let now = 0;
    const runner = createResultReviewer(() => now);
    const ctx = context();
    ctx.reviewResult.mockRejectedValueOnce(new Error('통신 오류'));
    runner.tick(ctx); runner.tick(ctx);
    expect(ctx.reviewResult).toHaveBeenCalledTimes(1);
    await flush();
    now = 29_999; runner.tick(ctx);
    expect(ctx.reviewResult).toHaveBeenCalledTimes(1);
    now = 30_000; runner.tick(ctx); runner.tick(ctx);
    await flush();
    expect(ctx.reviewResult).toHaveBeenCalledTimes(2);
    expect(ctx.setSnap).toHaveBeenCalled();
    runner.tick(ctx);
    expect(ctx.reviewResult).toHaveBeenCalledTimes(2);
  });
  it('반복 오류에는 대기 시간을 늘린다', async () => {
    let now = 0;
    const runner = createResultReviewer(() => now);
    const ctx = context(); ctx.reviewResult.mockRejectedValue(new Error('오류'));
    runner.tick(ctx); await flush();
    now = 30_000; runner.tick(ctx); await flush();
    now = 89_999; runner.tick(ctx);
    expect(ctx.reviewResult).toHaveBeenCalledTimes(2);
    now = 90_000; runner.tick(ctx); await flush();
    expect(ctx.reviewResult).toHaveBeenCalledTimes(3);
  });
  it('Claude 대기를 주기적으로 확인해 서버의 만료 후 대체 채점이 실행될 수 있다', async () => {
    let now = 0;
    const runner = createResultReviewer(() => now);
    const ctx = context();
    ctx.reviewResult.mockResolvedValueOnce('started').mockResolvedValueOnce('waiting');
    runner.tick(ctx); await flush();
    now = 59_999; runner.tick(ctx);
    expect(ctx.reviewResult).toHaveBeenCalledTimes(1);
    now = 60_000; runner.tick(ctx); await flush();
    now = 120_000; runner.tick(ctx); await flush();
    expect(ctx.reviewResult).toHaveBeenCalledTimes(3);
    expect(ctx.setSnap).toHaveBeenCalledTimes(1);
  });
  it('이미 채점된 결과에는 AI를 다시 호출하지 않는다', () => {
    const ctx = context(); ctx.snap.workflow.reviews = [passReview];
    createResultReviewer().tick(ctx);
    expect(ctx.reviewResult).not.toHaveBeenCalled();
  });
});

describe('다시 개발은 서버가 먼저(v0.6.12)', () => {
  it('redo 판정을 보면 2분 기다렸다가, 그때도 수정 요청이 없으면 앱이 대신 보낸다', async () => {
    let now = 0;
    const runner = createResultReviewer(() => now);
    const ctx = context();
    ctx.snap.workflow = { ...ctx.snap.workflow, reviews: [{ ...passReview, verdict: 'redo', feedback: '- 고칠 점' }] };
    runner.tick(ctx);
    await flush();
    expect(ctx.requestRevision).not.toHaveBeenCalled();
    now = 119_999; runner.tick(ctx);
    expect(ctx.requestRevision).not.toHaveBeenCalled();
    now = 120_000; runner.tick(ctx);
    await flush();
    expect(ctx.requestRevision).toHaveBeenCalledTimes(1);
  });
});
