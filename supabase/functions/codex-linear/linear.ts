// Codex를 Linear로 맡기기(v0.5.2): Linear GraphQL 글과 응답 해석(외부 의존 없음: Deno 함수와 vitest가 같이 쓴다).

export const LOOKUP_QUERY = `query MinLabCodexLookup {
  teams(first: 20) { nodes { id key name } }
  users(first: 250, includeDisabled: false) { nodes { id name displayName } }
  issueInput: __type(name: "IssueCreateInput") { inputFields { name } }
  issueLabels(first: 250) { nodes { id name team { id } } }
}`;

export const CREATE_ISSUE = `mutation MinLabCodexIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}`;

export const CREATE_COMMENT = `mutation MinLabCodexComment($input: CommentCreateInput!) {
  commentCreate(input: $input) { success }
}`;

export const UPDATE_ISSUE = `mutation MinLabCodexReassign($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;

export const STATUS_QUERY = `query MinLabCodexStatus($id: String!) {
  issue(id: $id) {
    id identifier url
    state { name type }
    comments(last: 20) { nodes { body createdAt user { name displayName } botActor { name } } }
  }
}`;

type Lookup = {
  teams?: { nodes?: { id?: string; key?: string; name?: string }[] };
  users?: { nodes?: { id?: string; name?: string; displayName?: string }[] };
  issueInput?: { inputFields?: { name?: string }[] } | null;
  issueLabels?: { nodes?: { id?: string; name?: string; team?: { id?: string } | null }[] };
};

/** 팀(키·이름을 정했으면 그 팀, 아니면 첫 팀), Codex 앱 사용자, 위임 칸 여부, AI Office 라벨(v0.5.4 소유자: 라벨 이름 "ai office") */
export function readLookup(data: Lookup, teamKey = '', labelName = 'ai office'): { teamId: string | null; codexId: string | null; canDelegate: boolean; canSetId: boolean; labelId: string | null } {
  const teams = data.teams?.nodes ?? [];
  const want = teamKey.trim().toLowerCase();
  const team = want ? teams.find((t) => (t.key ?? '').toLowerCase() === want || (t.name ?? '').toLowerCase() === want) : teams[0];
  // 라벨은 그 팀 라벨이나 워크스페이스 공통 라벨(team 없음)만, 이름은 대소문자·공백 무시
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const label = (data.issueLabels?.nodes ?? []).find((l) => norm(l.name ?? '') === norm(labelName) && (!l.team?.id || l.team.id === team?.id));
  const codex = (data.users?.nodes ?? []).find((u) => /^codex$/i.test((u.displayName ?? '').trim()) || /^codex$/i.test((u.name ?? '').trim())) ??
    (data.users?.nodes ?? []).find((u) => /codex/i.test(`${u.name ?? ''} ${u.displayName ?? ''}`));
  return {
    teamId: team?.id ?? null,
    codexId: codex?.id ?? null,
    canDelegate: (data.issueInput?.inputFields ?? []).some((f) => f.name === 'delegateId'),
    canSetId: (data.issueInput?.inputFields ?? []).some((f) => f.name === 'id'),
    labelId: label?.id ?? null,
  };
}

/** 이슈 입력: 위임 칸이 있으면 Codex에게 위임, 없으면 담당자로 */
export function issueInput(p: { teamId: string; codexId: string | null; canDelegate: boolean; title: string; description: string; labelId?: string | null; issueId?: string }): Record<string, unknown> {
  return {
    teamId: p.teamId,
    ...(p.issueId ? { id: p.issueId } : {}),
    ...(p.labelId ? { labelIds: [p.labelId] } : {}),
    title: p.title.slice(0, 250),
    description: p.description,
    ...(p.codexId ? (p.canDelegate ? { delegateId: p.codexId } : { assigneeId: p.codexId }) : {}),
  };
}

export interface CodexNews {
  /** Codex가 남긴 마지막 말(짧게) */
  last: string;
  /** 'error' = 시작하지 못함(한도·환경 없음 등), 'working' = 소식 있음, 'none' = 아직 없음 */
  kind: 'error' | 'working' | 'none';
  /** Codex 작업 주소(있으면) */
  taskUrl: string | null;
  issueState: string;
}

type Status = {
  issue?: {
    state?: { name?: string } | null;
    comments?: { nodes?: { body?: string; createdAt?: string; user?: { name?: string; displayName?: string } | null; botActor?: { name?: string } | null }[] };
  } | null;
};

/** 이슈 댓글에서 Codex 소식만 읽는다(사람 댓글·지시문은 해석하지 않는다) */
export function readNews(data: Status): CodexNews {
  const comments = data.issue?.comments?.nodes ?? [];
  const fromCodex = comments
    .filter((c) => /codex/i.test(`${c.user?.name ?? ''} ${c.user?.displayName ?? ''} ${c.botActor?.name ?? ''}`))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const lastC = fromCodex[fromCodex.length - 1];
  const body = (lastC?.body ?? '').replace(/\s+/g, ' ').trim();
  const all = fromCodex.map((c) => c.body ?? '').join('\n');
  const taskUrl = all.match(/https:\/\/chatgpt\.com\/codex\/tasks\/[A-Za-z0-9_-]+/)?.[0] ?? null;
  const kind: CodexNews['kind'] = !lastC ? 'none' : /couldn'?t start|cannot start|usage limits?|no available environments/i.test(body) ? 'error' : 'working';
  return { last: body.slice(0, 240), kind, taskUrl, issueState: data.issue?.state?.name ?? '' };
}
