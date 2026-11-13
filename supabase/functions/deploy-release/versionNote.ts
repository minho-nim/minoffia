// 옵시디언 버전 노트(v0.6.89, 소유자 "버전마다 쓴 스킬·만든 AI로 이어지게, 너무 복잡하지 않게"): 배포가 성공하면
// 이 저장소의 Actions '옵시디언 버전 노트'(notes-version.yml)를 시작만 한다. 노트는 Actions가 만든다. AI 호출 없음.
// usedSkills는 src/domain/skills.ts의 것을 그대로 복사했다(함수마다 따로 배포되므로). 같은지는 versionNote.test.ts가 확인한다.

export function usedSkills(summary: string, testLog = ''): string[] {
  const out = new Set<string>();
  const ok = (n: string) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(n);
  for (const m of summary.matchAll(/^(?:쓴 스킬|스킬 확인)\s*[:：]\s*(.+)$/gm)) {
    for (const n of m[1].split(/[,，、\s]+/)) {
      const name = n.trim().replace(/[`'".]/g, '').toLowerCase();
      if (ok(name)) out.add(name);
    }
  }
  for (const m of testLog.matchAll(/(?:\.claude|\.agents)\/skills\/([a-z0-9][a-z0-9-]{0,63})\//g)) out.add(m[1]);
  for (const m of summary.matchAll(/\b([a-z0-9]+(?:-[a-z0-9]+)+)\s*(?:절차|스킬)\s*(?:로|대로|을 따라|를 따라)/g)) if (ok(m[1])) out.add(m[1]);
  return [...out];
}

/** 결과 출처 → 만든 AI 이름(옵시디언 공용 노트 이름) */
export function agentOf(source: string): string {
  const s = source.toLowerCase();
  if (s.startsWith('codex')) return 'Codex';
  if (s.startsWith('claude')) return 'Claude';
  if (s.startsWith('gemini')) return 'Gemini';
  return '직접';
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Actions 입력(모두 글자, 짧게) */
export function versionInputs(v: { project: string; repo: string; sha: string; task: string; score: number | null; pr: string; source: string; summary: string; testLog: string; at: string }): Record<string, string> {
  return {
    project: clean(v.project, 80),
    repo: clean(v.repo, 100),
    sha: /^[0-9a-f]{7,40}$/i.test(v.sha) ? v.sha : '',
    task: clean(v.task, 120),
    score: v.score == null ? '' : String(Math.round(v.score)),
    pr: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(v.pr) ? v.pr : '',
    agent: agentOf(v.source),
    skills: usedSkills(v.summary, v.testLog).slice(0, 12).join(','),
    date: v.at.slice(0, 10),
  };
}
