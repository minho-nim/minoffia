/** DB에 먼저 예약한 UUID로 생성한다. 재전송/응답 유실 뒤에도 같은 이슈를 조회한다. */
export type LinearIssue = { id: string; identifier: string; url: string };
export async function dispatchTrackedIssue(p: {
  issueId: string;
  create: (id: string) => Promise<LinearIssue>;
  read: (id: string) => Promise<LinearIssue | null>;
  mention?: (id: string) => Promise<void>;
  save: (issue: LinearIssue) => Promise<void>;
}): Promise<LinearIssue> {
  let issue: LinearIssue;
  try {
    issue = await p.create(p.issueId);
  } catch (e) {
    // 중복 UUID 또는 응답 유실일 수 있으므로 새 이슈를 만들지 않고 기존 UUID를 확인한다.
    const existing = await p.read(p.issueId).catch(() => null);
    if (!existing) throw e;
    issue = existing;
  }
  if (issue.id !== p.issueId) throw new Error(`예약한 식별자와 다른 Linear 이슈입니다: ${issue.url}`);
  await p.mention?.(issue.id);
  try {
    await p.save(issue);
  } catch {
    throw new Error(`Linear 이슈는 생성됐지만 상태 저장을 확인하지 못했어요. '소식 다시 읽기'로 확인하세요: ${issue.url}`);
  }
  return issue;
}
