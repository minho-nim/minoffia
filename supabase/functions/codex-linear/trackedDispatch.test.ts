import { describe, expect, it, vi } from 'vitest';
import { dispatchTrackedIssue } from './trackedDispatch';

const issue = { id: 'reserved-id', identifier: 'MIN-123', url: 'https://linear.app/test/issue/MIN-123' };
function params() {
  return { issueId: issue.id, create: vi.fn().mockResolvedValue(issue), read: vi.fn().mockResolvedValue(null), save: vi.fn().mockResolvedValue(undefined) };
}
describe('예약한 Linear 식별자로 추적 유지', () => {
  it('DB 저장 실패를 성공으로 응답하지 않고 생성된 이슈 주소를 알려준다', async () => {
    const p = params(); p.save.mockRejectedValueOnce(new Error('DB disconnected'));
    await expect(dispatchTrackedIssue(p)).rejects.toThrow(issue.url);
    expect(p.create).toHaveBeenCalledExactlyOnceWith(issue.id);
  });
  it('생성 응답이 유실돼도 같은 UUID로 조회하고 새 이슈를 만들지 않는다', async () => {
    const p = params();
    p.create.mockRejectedValueOnce(new Error('timeout'));
    p.read.mockResolvedValue(issue);
    await expect(dispatchTrackedIssue(p)).resolves.toEqual(issue);
    expect(p.read).toHaveBeenCalledExactlyOnceWith(issue.id);
    expect(p.create).toHaveBeenCalledTimes(1);
    expect(p.save).toHaveBeenCalledExactlyOnceWith(issue);
  });
  it('생성·조회 모두 불확실하면 성공 처리나 멘션을 하지 않는다', async () => {
    const p = { ...params(), mention: vi.fn() };
    p.create.mockRejectedValueOnce(new Error('timeout'));
    await expect(dispatchTrackedIssue(p)).rejects.toThrow('timeout');
    expect(p.save).not.toHaveBeenCalled();
    expect(p.mention).not.toHaveBeenCalled();
  });
  it('다른 식별자의 응답으로 연결을 바꿔 붙이지 않는다', async () => {
    const p = params(); p.create.mockResolvedValue({ ...issue, id: 'different' });
    await expect(dispatchTrackedIssue(p)).rejects.toThrow('예약한 식별자와 다른');
    expect(p.save).not.toHaveBeenCalled();
  });
  it('멘션 실패도 성공 처리하지 않는다', async () => {
    const p = { ...params(), mention: vi.fn().mockRejectedValue(new Error('comment failed')) };
    await expect(dispatchTrackedIssue(p)).rejects.toThrow('comment failed');
    expect(p.save).not.toHaveBeenCalled();
    expect(p.mention).toHaveBeenCalledWith(issue.id);
  });
});
