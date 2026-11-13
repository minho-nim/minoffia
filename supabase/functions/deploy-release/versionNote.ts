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

/** 결과 요약의 '쓴 MCP:' 줄(v0.6.98) */
export function usedMcp(summary: string): string[] {
  const out = new Set<string>();
  for (const m of summary.matchAll(/^쓴 MCP\s*[:：]\s*(.+)$/gim)) for (const n of m[1].split(/[,，、\s]+/)) { const k = n.trim().replace(/[`'".]/g, '').toLowerCase(); if (/^[a-z0-9][a-z0-9_-]{0,40}$/.test(k)) out.add(k); }
  return [...out];
}

/** 결과 출처 → 만든 AI 이름(옵시디언 공용 노트 이름) */
export function agentOf(source: string): string {
  const s = source.toLowerCase();
  if (s.startsWith('codex')) return 'Codex';
  if (s.startsWith('claude')) return 'Claude';
  if (s.startsWith('gemini')) return 'Gemini';
  // 수동으로 붙인 결과 등도 Codex로 본다(소유자 2026-11-13 "Claude로 대화 안 한 건 다 Codex")
  return 'Codex';
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
    mcp: usedMcp(v.summary).slice(0, 8).join(','),
    date: v.at.slice(0, 10),
  };
}
