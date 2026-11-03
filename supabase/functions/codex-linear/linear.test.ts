import { describe, expect, it } from 'vitest';
import { issueInput, readLookup, readNews } from './linear';

describe('Codex Linear(v0.5.2)', () => {
  const lookup = {
    teams: { nodes: [{ id: 't1', key: 'MIN', name: 'MinLab' }, { id: 't2', key: 'X', name: 'X' }] },
    users: { nodes: [{ id: 'u1', name: 'minonim', displayName: 'minonim' }, { id: 'u2', name: 'Codex', displayName: 'codex' }] },
    issueInput: { inputFields: [{ name: 'teamId' }, { name: 'delegateId' }] },
  };
  it('팀·Codex·위임 칸을 찾는다', () => {
    expect(readLookup(lookup)).toEqual({ teamId: 't1', codexId: 'u2', canDelegate: true });
    expect(readLookup(lookup, 'x').teamId).toBe('t2');
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
});
