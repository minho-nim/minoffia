import { describe, expect, it } from 'vitest';
import { readProbe } from './probe';

describe('Linear 연결 확인 해석(v0.4.11)', () => {
  it('Codex 사용자와 위임 칸을 찾는다', () => {
    const r = readProbe({
      viewer: { name: '민호' },
      teams: { nodes: [{ key: 'MIN', name: 'MinLab' }] },
      users: { nodes: [{ name: '민호', displayName: 'minho' }, { name: 'Codex', displayName: 'codex' }] },
      issueInput: { inputFields: [{ name: 'title' }, { name: 'delegateId' }] },
    });
    expect(r).toEqual({ viewer: '민호', teams: [{ key: 'MIN', name: 'MinLab' }], codexUser: 'codex', canDelegate: true });
  });

  it('없으면 없다고 한다', () => {
    expect(readProbe({ users: { nodes: [{ name: '민호' }] }, issueInput: null })).toMatchObject({ codexUser: null, canDelegate: false, teams: [] });
  });
});
