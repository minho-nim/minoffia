import { describe, expect, it } from 'vitest';
import { issueInput, readLookup, readNews } from './linear';

describe('Codex Linear(v0.5.2)', () => {
  const lookup = {
    teams: { nodes: [{ id: 't1', key: 'MIN', name: 'MinLab' }, { id: 't2', key: 'X', name: 'X' }] },
    users: { nodes: [{ id: 'u1', name: 'minonim', displayName: 'minonim' }, { id: 'u2', name: 'Codex', displayName: 'codex' }] },
    issueInput: { inputFields: [{ name: 'teamId' }, { name: 'delegateId' }, { name: 'id' }] },
    issueLabels: { nodes: [{ id: 'l0', name: 'ai office', team: { id: 't2' } }, { id: 'l1', name: 'AI  Office', team: { id: 't1' } }] },
  };
  it('팀·Codex·위임 칸·라벨을 찾는다', () => {
    expect(readLookup(lookup)).toEqual({ teamId: 't1', codexId: 'u2', canDelegate: true, canSetId: true, labelId: 'l1' });
    expect(readLookup(lookup, 'x').teamId).toBe('t2');
    expect(readLookup({ ...lookup, teams: { nodes: [{ id: 't1', key: 'MIN', name: 'Mino' }] } }, 'mino').teamId).toBe('t1');
    expect(readLookup(lookup, '', '없는 라벨').labelId).toBeNull();
  });
  it('명시한 팀이 없으면 첫 팀으로 대체하지 않는다', () => {
    expect(readLookup(lookup, '없는 팀').teamId).toBeNull();
    expect(readLookup(lookup, '  MIN  ').teamId).toBe('t1');
    expect(readLookup(lookup, '').teamId).toBe('t1');
  });
  it('서버가 예약한 이슈 식별자를 생성 요청에 넣는다', () => {
    expect(issueInput({ teamId: 't1', codexId: 'u2', canDelegate: true, title: 'a', description: 'b', issueId: 'reserved-id' })).toMatchObject({ id: 'reserved-id' });
    expect(readLookup({ ...lookup, issueInput: null }).canSetId).toBe(false);
  });
  it('라벨이 있으면 붙인다', () => {
    expect(issueInput({ teamId: 't1', codexId: null, canDelegate: true, title: 'a', description: 'b', labelId: 'l1' })).toMatchObject({ labelIds: ['l1'] });
  });
  it('위임 칸이 있으면 위임, 없으면 담당자', () => {
    expect(issueInput({ teamId: 't1', codexId: 'u2', canDelegate: true, title: 'a', description: 'b' })).toMatchObject({ delegateId: 'u2' });
    expect(issueInput({ teamId: 't1', codexId: 'u2', canDelegate: false, title: 'a', description: 'b' })).toMatchObject({ assigneeId: 'u2' });
  });
  it('Codex 댓글만 읽고 시작 실패를 알아본다', () => {
    const n = readNews({ issue: { state: { name: 'Todo' }, comments: { nodes: [
      { body: '@Codex 해 줘', createdAt: '1', user: { name: 'minonim' } },
      { body: "Codex couldn't start a task for this request: You have reached your Codex usage limits.", createdAt: '2', botActor: { name: 'Codex' } },
    ] } } });
    expect(n.kind).toBe('error');
    expect(n.last).toContain('usage limits');
    const w = readNews({ issue: { comments: { nodes: [{ body: 'Working on it https://chatgpt.com/codex/tasks/task_e_abc123', createdAt: '3', user: { name: 'Codex' } }] } } });
    expect(w).toMatchObject({ kind: 'working', taskUrl: 'https://chatgpt.com/codex/tasks/task_e_abc123' });
    expect(readNews({ issue: { comments: { nodes: [] } } }).kind).toBe('none');
  });
  it('환경 없음은 쉬운 안내를 붙인다(v0.6.19)', () => {
    const n = readNews({ issue: { comments: { nodes: [{ body: "Codex couldn't start a task for this request: Codex cannot start tasks because the workspace has no available environments.", createdAt: '1', user: { name: 'Codex' } }] } } });
    expect(n.kind).toBe('error');
    expect(n.last).toMatch(/^Codex 환경 없음 — .*게시/);
  });
});
