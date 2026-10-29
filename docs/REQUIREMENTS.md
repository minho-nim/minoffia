# Requirements gathered from conversation — 2026-10-29

## Hard constraints
- Existing Claude Pro, Codex access; Grok and two AI Studio Build accounts free; **no extra bills, no purchased tokens or credits**.
- Works on two Windows computers and on mobile; automatic remote work while both PCs are off (for supported cloud agents).
- 2D pixel office based on six-page 'Claude Code 오피스 만들기.pdf': office rooms, avatars, state movement, status speech bubbles.
- User directs tasks from office itself; auto triage / smart assignment; usage management; GitHub PR/Preview; human approval before live deploy.
- Share *produced apps* with friends; keep office private; future commercial/portfolio potential; MinLab repository remains unchanged.

## Confirmed limitations
- Claude Cloud Routines support HTTP API triggers on qualifying paid plans, with quota and research-preview instability.
- Claude Pro is not an unbounded Anthropic API quota. API calls must not be billed implicitly.
- Unattended free Grok Build, Codex subscription reuse as headless API and free AI Studio Build external invocation are **not established**. Manual handoff only until verified.
- Cloudflare Pages serves frontend; Supabase holds auth and task data; Github stores source; Claude Cloud provides ephemeral development sessions.
- External AI quotas cannot be pooled, and accurate remaining subscription tokens are not universally available.

## Product acceptance, v0.1
1. Home renders original pixel office with 6 recognizable rooms and 7 clickable agents.
2. User can add projects, add tasks, auto-route without model calls, update statuses, delete tasks, copy handoff.
3. Local demo works without credentials; visibly marked local-only.
4. With Supabase keys and migration, account login and task persistence function across devices.
5. Backend requires authenticated owner, project allowlist, DB atomic claim, rate cap and secrets for Claude Routines trigger.
6. A failed remote trigger never shows 'completed'; returns clear error and blocks unreviewed retry.
7. No direct autopush/merge/deployment; GitHub CI verifies PR.
8. Real provider events, not invented animation status, drive live activity.
