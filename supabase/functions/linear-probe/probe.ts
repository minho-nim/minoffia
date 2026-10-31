// Linear 연결 확인(읽기만): 응답 해석(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).
// 이슈·댓글·위임을 만들지 않는다. Codex 사용자를 찾았는지, 이슈를 맡길 칸(delegateId)이 있는지만 본다.

export const PROBE_QUERY = `query MinLabProbe {
  viewer { name }
  teams(first: 20) { nodes { key name } }
  users(first: 250) { nodes { name displayName } }
  issueInput: __type(name: "IssueCreateInput") { inputFields { name } }
}`;

export interface ProbeResult {
  viewer: string;
  teams: { key: string; name: string }[];
  /** Linear 워크스페이스에 Codex(앱 사용자)가 보이는가 */
  codexUser: string | null;
  /** 이슈를 에이전트에게 맡기는 칸(delegateId)이 공식 스키마에 있는가 */
  canDelegate: boolean;
}

type Raw = {
  viewer?: { name?: string };
  teams?: { nodes?: { key?: string; name?: string }[] };
  users?: { nodes?: { name?: string; displayName?: string }[] };
  issueInput?: { inputFields?: { name?: string }[] } | null;
};

export function readProbe(data: Raw): ProbeResult {
  const users = data.users?.nodes ?? [];
  const codex = users.find((u) => /codex/i.test(`${u.name ?? ''} ${u.displayName ?? ''}`));
  return {
    viewer: data.viewer?.name ?? '',
    teams: (data.teams?.nodes ?? []).map((t) => ({ key: t.key ?? '', name: t.name ?? '' })),
    codexUser: codex ? codex.displayName || codex.name || 'Codex' : null,
    canDelegate: (data.issueInput?.inputFields ?? []).some((f) => f.name === 'delegateId'),
  };
}
