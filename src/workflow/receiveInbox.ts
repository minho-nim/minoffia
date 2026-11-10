import { newId, type OfficeStore } from '../data/store';
import { parsePmPlan } from '../domain/pmPlan';
import { deriveWorkflow, sha256Hex } from '../domain/workflow';
import { maskSecrets } from '../domain/maskSecrets';
import type { Snapshot, Task } from '../domain/types';
import type { PmPlan } from '../domain/workflow-types';

type Context = {
  store: OfficeStore;
  snap: Snapshot;
  reported: Set<string>;
  importPlanText: (task: Task, text: string, source: PmPlan['source'], data: Snapshot, expectedSpecRevision?: number) => Promise<string[] | null>;
  step: (taskId: string, fn: () => Promise<void>, ok?: string) => Promise<boolean>;
  say: (kind: 'ok' | 'error', text: string) => void;
};

/** 받은 계획·개발 결과를 검증한 뒤 옮긴다. 저장 성공 전에는 수신 완료로 표시하지 않는다. */
export async function receiveWorkflowInbox({ store, snap, reported, importPlanText, step, say }: Context): Promise<void> {
  for (const item of await store.loadPlanInbox()) {
    const task = snap.tasks.find((t) => t.id === item.taskId);
    if (!task) continue;
    const view = deriveWorkflow(task, snap.workflow);
    const errors =
      !view.spec || view.spec.revision !== item.specRevision
        ? [`기획서 v${item.specRevision}의 계획인데 지금 기획서는 v${view.spec?.revision ?? 0}입니다.`]
        : view.plan && view.plan.approvedSpecRevision === item.specRevision && !view.pendingRevision
          ? ['이 기획서 버전의 계획이 이미 있습니다.']
          : null;
    const parsed = parsePmPlan(item.planText, task.id);
    const parsedErrors = errors ?? (parsed.ok ? null : parsed.errors);
    if (parsedErrors) {
      if (await store.markPlanInbox(item.id, 'invalid', parsedErrors.join(' / '))) say('error', `PM이 보낸 계획을 쓰지 못했습니다(${task.title}): ${parsedErrors.join(' / ')}`);
      continue;
    }
    // v0.4.20: 먼저 저장하고, 저장에 성공했을 때만 "받음"으로 표시한다(실패하면 다음 확인 때 다시 시도).
    const failed = await importPlanText(task, item.planText, 'routine_session_auto', snap, item.specRevision);
    if (failed) {
      // 다른 기기가 먼저 저장했으면(같은 버전 계획이 이미 있음) 받음으로만 표시한다.
      const fresh = await store.load();
      const again = deriveWorkflow(task, fresh.workflow);
      if (again.plan && again.plan.approvedSpecRevision === item.specRevision && !again.pendingRevision) await store.markPlanInbox(item.id, 'imported', '');
      else if (!reported.has(item.id)) {
        reported.add(item.id);
        say('error', `PM 계획 자동 저장 실패(${task.title}): ${failed.join(' / ')} — 1분 뒤 다시 시도해요. 계속 안 되면 PM 세션의 JSON을 업무 카드에 붙여넣으세요.`);
      }
      continue;
    }
    await store.markPlanInbox(item.id, 'imported', '');
  }
  // Claude 보조 개발 세션이 보낸 결과(dev_result_inbox)를 결과 패키지로 옮긴다(v0.4.3). GitHub에는 올리지 않는다.
  for (const item of await store.loadResultInbox()) {
    const task = snap.tasks.find((t) => t.id === item.taskId);
    const a = snap.workflow.assignments.find((x) => x.id === item.assignmentId);
    if (!task || !a) continue;
    // 다른 기기가 이미 같은 결과를 저장했으면 받음으로만 표시한다.
    // 시험 기록의 토큰·키처럼 생긴 글자는 저장 전에 가린다(v0.5.49, 서버에서도 가림)
    const testLog = maskSecrets(item.testLog);
    const itemSha = await sha256Hex(`${item.diff}\n---\n${testLog}`);
    if (snap.workflow.results.some((r) => r.taskId === task.id && r.sha256 === itemSha)) {
      await store.markResultInbox(item.id, 'imported', '');
      continue;
    }
    const view = deriveWorkflow(task, snap.workflow);
    const fromGemini = a.assignee === 'gemini' && a.executionMode === 'gemini_actions';
    // v0.6.19: Codex(Linear)도 결과 제출표로 직접 보낸다
    const fromCodex = a.assignee === 'codex';
    const who = fromGemini ? 'Gemini' : fromCodex ? 'Codex' : 'Claude';
    const why =
      a.assignee !== 'claude' && !fromGemini && !fromCodex
        ? '자동 개발(Claude·Gemini·Codex) 작업이 아닙니다.'
        : !view.plan || a.planRevision !== view.plan.planRevision
          ? '지금 계획의 작업이 아닙니다(계획이 바뀌었음).'
          : a.dispatchStatus !== 'started' && a.dispatchStatus !== 'starting'
            ? '시작된 작업이 아닙니다(중단·완료됨).'
            : view.bApproved
              ? '이미 결과 승인(B)한 결과가 있습니다.'
              : null;
    if (why) {
      if (await store.markResultInbox(item.id, 'invalid', why)) say('error', `${who}가 보낸 결과를 쓰지 못했습니다(${task.title}): ${why}`);
      continue;
    }
    // v0.5.88: 개발이 끝까지 못 가서 바뀐 것이 하나도 없는 결과는 결과 패키지로 만들지 않고 작업을 '중단'으로 표시한다.
    // (그러지 않으면 작업이 계속 '진행 중'으로 남아 다시 하기·넘기기를 못 했다) 업무 카드에서 다시 시작하거나 다른 AI로 넘긴다.
    if (!item.diff.trim()) {
      const note = (item.remainingIssues || item.summary || '바뀐 것이 없음').slice(0, 200);
      await store.updateAssignment({ ...a, dispatchStatus: 'failed', actualProviderStatus: note, lastVerifiedAt: new Date().toISOString() }).catch(() => undefined);
      if (await store.markResultInbox(item.id, 'invalid', '바뀐 것이 없는 결과(개발 실패)')) say('error', `${who} 개발이 끝까지 못 갔어요(${task.title}). 업무 카드에서 다시 시작하거나 다른 AI로 넘기세요.`);
      continue;
    }
    const summary = [
      maskSecrets(item.summary),
      item.changedFiles ? `\n바뀐 파일:\n${item.changedFiles}` : '\n바뀐 파일: 없음',
      item.branch ? `\n작업 브랜치: ${item.branch} (${item.previewUrl ? '미리보기용으로 올림, PR은 결과 승인 뒤' : fromGemini ? 'Gemini가 올림, PR은 결과 승인 뒤' : 'PR은 결과 승인 뒤'})` : '',
    ].join('\n');
    const ok = await step(
      task.id,
      async () => {
        const revision = Math.max(0, ...snap.workflow.results.filter((r) => r.taskId === task.id).map((r) => r.revision)) + 1;
        await store.addResult({
          id: newId(),
          taskId: task.id,
          revision,
          planRevision: a.planRevision,
          workItemId: a.workItemId,
          source: fromGemini ? 'gemini_actions_auto' : fromCodex ? 'codex_linear_auto' : 'claude_session_auto',
          summary: summary.slice(0, 4000),
          diff: item.diff,
          testLog,
          remainingIssues: maskSecrets(item.remainingIssues),
          sha256: itemSha,
          previewUrl: item.previewUrl,
          createdAt: new Date().toISOString(),
        });
        // 자동 개발이 찍어 보낸 데스크톱·휴대폰 화면을 결과 스크린샷으로 붙인다(v0.4.97, 실패해도 결과는 그대로)
        if (item.screenshots.length) await store.linkResultShots(task.id, revision, item.screenshots).catch(() => undefined);
        await store.updateAssignment({ ...a, dispatchStatus: 'completed', actualProviderStatus: 'session_reported_result', lastVerifiedAt: new Date().toISOString() });
      },
      `${who}가 보낸 결과(${a.workItemId})를 결과 패키지로 저장했습니다. 보고 결과 승인(B)하거나 수정 요청하세요.`,
    );
    // v0.4.20: 저장에 성공했을 때만 "받음"으로 표시한다(실패하면 다음 확인 때 다시 시도).
    if (ok) await store.markResultInbox(item.id, 'imported', '');
    else if (!reported.has(item.id)) {
      reported.add(item.id);
      say('error', `결과 자동 저장 실패(${task.title}) — 1분 뒤 다시 시도해요. 계속 안 되면 Claude 세션의 마지막 메시지를 결과 패키지에 붙여넣으세요.`);
    }
  }
  // 결과는 저장됐는데 작업이 '시작됨'에 남은 경우(v0.5.33 전에는 완료 기록이 DB에서 막혔다): 그 작업의 자동 결과가
  // 이미 있으면 완료로 고친다. 그래야 결과 승인(B)이 "결과를 기다리는 중"으로 막히지 않는다.
  for (const a of snap.workflow.assignments) {
    if (a.dispatchStatus !== 'started' && a.dispatchStatus !== 'starting') continue;
    const got = snap.workflow.results.some(
      (r) => r.taskId === a.taskId && r.planRevision === a.planRevision && r.workItemId === a.workItemId && (r.source === 'gemini_actions_auto' || r.source === 'claude_session_auto' || r.source === 'codex_linear_auto'),
    );
    if (got) await store.updateAssignment({ ...a, dispatchStatus: 'completed', actualProviderStatus: 'session_reported_result' }).catch(() => undefined);
  }
}
