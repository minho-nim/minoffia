import { useState } from 'react';
import { attachmentBlocker, attachmentsOf, MAX_REQUEST_FILES, MAX_RESULT_FILES, ROLES_FOR, type Attachment, type AttachmentKind, type ImageAnalysis } from '../domain/attachments';
import { AttachmentGallery, ImagePicker, type PendingImage } from './Attachments';
import { RequestContext } from './RequestContext';
import { clarificationsOf, linksOf, type Clarification, type LinkRef } from '../domain/requestContext';
import { ADAPTER_STATE_LABEL, adapterFor } from '../domain/adapters';
import { buildCodexHandoff, buildGptPackage } from '../domain/handoffV2';
import type { Project, Task } from '../domain/types';
import { startBlocker } from '../domain/concurrency';
import { canApprove, canRequestRevision, prCheckPasses, type WorkflowView } from '../domain/workflow';
import type { AgentAssignment, Gate, Intent, PrCheck } from '../domain/workflow-types';
import { DISPATCH_STATUS_LABEL, GATE_LABEL, INTENT_LABEL, STAGE_LABEL } from '../domain/workflow-types';

export interface SpecFields {
  intent: Intent;
  finalPrompt: string;
  changeScope: string;
  preserveConstraints: string;
  testCriteria: string;
  answer: string;
}

export interface ResultFields {
  workItemId: string;
  summary: string;
  diff: string;
  testLog: string;
  remainingIssues: string;
}

export interface WorkflowActions {
  copy: (text: string) => Promise<boolean>;
  /** 성공하면 true. 실패 이유는 App이 알림으로 보여준다. */
  saveSpec: (task: Task, fields: SpecFields) => Promise<boolean>;
  decide: (task: Task, gate: Gate, revision: number, decision: 'approved' | 'rejected', workItemId?: string, scope?: Record<string, unknown>) => Promise<boolean>;
  dispatchPm: (task: Task, acknowledgeRetry: boolean) => Promise<void>;
  importPlan: (task: Task, text: string) => Promise<string[] | null>;
  recordStart: (assignment: AgentAssignment, url: string) => Promise<boolean>;
  /** 시작한 작업을 중단으로 기록(동시 실행 1개 제한을 푼다) */
  stopAssignment: (assignment: AgentAssignment) => Promise<boolean>;
  /** 결과 패키지와 스크린샷(결과를 저장한 뒤 올린다) */
  addResult: (task: Task, fields: ResultFields, images?: PendingImage[]) => Promise<boolean>;
  setPrUrl: (task: Task, url: string) => Promise<boolean>;
  /** 서버가 GitHub에서 PR·CI를 확인(Supabase 모드만) */
  checkPr?: (task: Task) => Promise<boolean>;
  /** 결과 검토 → Claude PM 수정 요청 */
  requestRevision: (task: Task, feedback: string) => Promise<boolean>;
  attachmentUrl: (attachment: Attachment) => Promise<string>;
  /** 실패한 파일의 이유 목록을 돌려준다(빈 배열 = 모두 성공) */
  addAttachments: (task: Task, kind: AttachmentKind, resultRevision: number | null, files: File[]) => Promise<string[]>;
  updateAttachment: (attachment: Attachment) => Promise<boolean>;
  deleteAttachment: (attachment: Attachment) => Promise<boolean>;
  moveAttachment: (task: Task, id: string, delta: -1 | 1) => Promise<boolean>;
  /** 요청 자료 이미지 Gemini 분석(Supabase 모드만) */
  analyzeImage?: (attachment: Attachment) => Promise<boolean>;
  /** 서버가 링크를 읽어 기록한다 */
  readLink: (task: Task, url: string) => Promise<boolean>;
  deleteLink: (link: LinkRef) => Promise<boolean>;
  addClarification: (task: Task, question: string, answer: string) => Promise<boolean>;
}

interface Props {
  task: Task;
  project: Project | undefined;
  view: WorkflowView;
  /** 이 업무의 첨부(요청 자료·결과 스크린샷) */
  attachments: Attachment[];
  /** 이 업무 이미지의 Gemini 분석 */
  analyses: ImageAnalysis[];
  /** 모든 업무의 배정(AI별 동시 작업 상한 규칙에 쓴다) */
  allAssignments: AgentAssignment[];
  /** 이 업무 PR 주소에 대한 최신 서버 확인 */
  prCheck?: PrCheck | null;
  /** AI별 동시 작업 상한 */
  agentLimits?: Partial<Record<'codex' | 'claude' | 'gemini' | 'grok', number>>;
  /** 모든 업무의 링크·확인 질문(이 업무 것만 골라 쓴다) */
  links: LinkRef[];
  clarifications: Clarification[];
  /** 링크 읽기는 Supabase 연결 때만 */
  canReadLinks: boolean;
  /** null이면 PM 전송 가능 */
  dispatchBlocker: string | null;
  actions: WorkflowActions;
}

const CI_LABEL: Record<PrCheck['ciState'], string> = { success: '성공', failure: '실패', pending: '진행 중', none: '없음' };

const STEPS = [
  { key: 'plan', label: '기획' },
  { key: 'A', label: 'A' },
  { key: 'pm', label: 'PM 계획' },
  { key: 'E', label: 'E·실행' },
  { key: 'B', label: '결과·B' },
  { key: 'C', label: 'C' },
] as const;

function stepIndex(view: WorkflowView): number {
  if (!view.spec || view.spec.intent === 'question' || view.spec.intent === 'ambiguous') return 0;
  if (!view.aApproved) return 1;
  if (!view.planCurrent && !view.result) return 2;
  if (!view.result) return 3;
  if (!view.bApproved) return 4;
  if (!view.cApproved) return 5;
  return 6;
}

const EMPTY_SPEC: SpecFields = { intent: 'change_request', finalPrompt: '', changeScope: '', preserveConstraints: '', testCriteria: '', answer: '' };

export function WorkflowPanel({ task, project, view, attachments, analyses, allAssignments, agentLimits, prCheck, links, clarifications, canReadLinks, dispatchBlocker, actions }: Props) {
  const current = stepIndex(view);
  const [editing, setEditing] = useState(false);
  const [spec, setSpec] = useState<SpecFields>(EMPTY_SPEC);
  const [planText, setPlanText] = useState('');
  const [planErrors, setPlanErrors] = useState<string[] | null>(null);
  const [startUrl, setStartUrl] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ResultFields>({ workItemId: '', summary: '', diff: '', testLog: '', remainingIssues: '' });
  const [showResultForm, setShowResultForm] = useState(false);
  const [prUrl, setPrUrl] = useState('');
  const [ciChecked, setCiChecked] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aFeedback, setAFeedback] = useState('');
  const [showAFeedback, setShowAFeedback] = useState(false);
  const [revisionText, setRevisionText] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [resultImages, setResultImages] = useState<PendingImage[]>([]);
  const requestImages = attachmentsOf(attachments, task.id, 'request');
  const analysisById = new Map(analyses.map((a) => [a.attachmentId, a]));
  const taskLinks = linksOf(links, task.id);
  const taskQa = clarificationsOf(clarifications, task.id);
  const resultShots = view.result ? attachmentsOf(attachments, task.id, 'result', view.result.revision) : [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const copy = async (key: string, text: string) => {
    const ok = await actions.copy(text);
    setCopied(ok ? key : null);
    if (ok) window.setTimeout(() => setCopied(null), 2500);
  };

  const startEdit = () => {
    setSpec(
      view.spec
        ? {
            intent: view.spec.intent,
            finalPrompt: view.spec.finalPrompt,
            changeScope: view.spec.changeScope,
            preserveConstraints: view.spec.preserveConstraints,
            testCriteria: view.spec.testCriteria,
            answer: view.spec.answer,
          }
        : EMPTY_SPEC,
    );
    setEditing(true);
  };

  const aCheck = canApprove(view, 'A');
  const bCheck = canApprove(view, 'B');
  const cCheck = canApprove(view, 'C');
  const failed = task.dispatch.state === 'failed';
  // 수정 요청이 있으면, 요청 뒤에 보냈을 때만 '보냄'으로 본다.
  const sentThisRevision =
    !!view.spec &&
    task.dispatchSpecRevision === view.spec.revision &&
    task.dispatch.state !== 'failed' &&
    (!view.pendingRevision || (!!task.dispatch.at && task.dispatch.at > view.pendingRevision.createdAt));
  const revisionCheck = canRequestRevision(view);

  return (
    <div className="wf">
      <div className="wf-head">
        <span className="pill">{STAGE_LABEL[view.stage]}</span>
        <ol className="wf-steps" aria-label="진행 단계">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i < current ? 'is-done' : i === current ? 'is-current' : ''}>
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      {/* 1. 기획(ChatGPT 수동 인계) */}
      <section className="wf-section">
        <h4>1. 기획 — ChatGPT</h4>
        {view.plannerFeedback && (
          <p className="task-error">
            v{view.spec?.revision}에 수정 요청: {view.plannerFeedback} — 자료를 다시 복사하면 이 내용이 함께 들어갑니다. ChatGPT 결과로 새 버전을 저장하세요.
          </p>
        )}
        <p className="muted small">
          ChatGPT 자동 연결은 없습니다(수동 인계). 자료를 복사해 ChatGPT에서 기획한 뒤, 결과를 아래에 저장하세요. 이미지는 아래에서 열어 ChatGPT 대화에 직접 첨부하세요(Gemini 이미지 분석은 아직 연결되지 않았습니다). 링크는 서버가 읽어 본문을 자료에 넣고, ChatGPT가 물어본 확인 질문은 답과 함께 기록해 두면 다음 자료에 들어갑니다.
        </p>
        <div className="wf-sub">
          <p className="small">
            <b>요청 자료 이미지</b> <span className="muted">· 비공개 저장, {MAX_REQUEST_FILES}장까지</span>
          </p>
          <AttachmentGallery
            items={requestImages}
            roles={ROLES_FOR.request}
            blocker={attachmentBlocker(view, 'request', 'add', requestImages.length)}
            max={MAX_REQUEST_FILES}
            urlFor={actions.attachmentUrl}
            onAdd={(files) => actions.addAttachments(task, 'request', null, files)}
            onUpdate={actions.updateAttachment}
            onDelete={actions.deleteAttachment}
            onMove={(id, d) => actions.moveAttachment(task, id, d)}
            emptyText="첨부한 이미지가 없습니다."
            analyses={analysisById}
            onAnalyze={actions.analyzeImage}
            analyzeBlocker={view.aApproved ? 'A 승인 뒤에는 분석을 붙이지 않습니다.' : null}
          />
        </div>
        <RequestContext task={task} view={view} links={taskLinks} clarifications={taskQa} canReadLinks={canReadLinks} actions={actions} />
        <div className="task-actions">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => void copy('gpt', buildGptPackage(task, project, view.spec && view.plannerFeedback ? { spec: view.spec, feedback: view.plannerFeedback } : null, requestImages, taskLinks, taskQa, analyses))}>
            {copied === 'gpt' ? '복사됨' : 'ChatGPT용 자료 복사'}
          </button>
          {!editing && (
            <button type="button" className="btn btn-small" onClick={startEdit}>
              {view.spec ? `기획서 고치기 (지금 v${view.spec.revision})` : 'GPT 기획 결과 저장'}
            </button>
          )}
        </div>
        {view.spec && !editing && (
          <div className="wf-spec">
            <p>
              <b>v{view.spec.revision}</b> · {INTENT_LABEL[view.spec.intent]}
            </p>
            {view.spec.intent === 'question' ? (
              <p className="wf-pre">{view.spec.answer || '(답변 없음)'}</p>
            ) : (
              <>
                <p className="wf-pre">{view.spec.finalPrompt || '(프롬프트 없음)'}</p>
                {view.spec.changeScope && <p className="small">변경 범위: {view.spec.changeScope}</p>}
                {view.spec.preserveConstraints && <p className="small">유지 조건: {view.spec.preserveConstraints}</p>}
                {view.spec.testCriteria && <p className="small">테스트 기준: {view.spec.testCriteria}</p>}
              </>
            )}
          </div>
        )}
        {editing && (
          <form
            className="task-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (await actions.saveSpec(task, spec)) setEditing(false);
              });
            }}
          >
            {view.aApproved && <p className="task-error">저장하면 새 버전이 되고, 이전 A 승인은 효력이 없어집니다.</p>}
            <label className="field">
              <span>GPT가 판단한 의도</span>
              <select id={`intent-${task.id}`} value={spec.intent} onChange={(e) => setSpec({ ...spec, intent: e.target.value as Intent })}>
                {(Object.keys(INTENT_LABEL) as Intent[]).map((k) => (
                  <option key={k} value={k}>
                    {INTENT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {spec.intent === 'question' ? (
              <label className="field">
                <span>GPT 답변 (개발로 넘어가지 않습니다)</span>
                <textarea id={`answer-${task.id}`} rows={4} value={spec.answer} onChange={(e) => setSpec({ ...spec, answer: e.target.value })} required />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>최종 개발 프롬프트</span>
                  <textarea
                    id={`prompt-${task.id}`}
                    rows={5}
                    value={spec.finalPrompt}
                    onChange={(e) => setSpec({ ...spec, finalPrompt: e.target.value })}
                    required={spec.intent !== 'ambiguous'}
                  />
                </label>
                <label className="field">
                  <span>변경 범위</span>
                  <input id={`scope-${task.id}`} value={spec.changeScope} onChange={(e) => setSpec({ ...spec, changeScope: e.target.value })} />
                </label>
                <label className="field">
                  <span>유지 조건</span>
                  <input id={`preserve-${task.id}`} value={spec.preserveConstraints} onChange={(e) => setSpec({ ...spec, preserveConstraints: e.target.value })} />
                </label>
                <label className="field">
                  <span>테스트 기준</span>
                  <input id={`tests-${task.id}`} value={spec.testCriteria} onChange={(e) => setSpec({ ...spec, testCriteria: e.target.value })} />
                </label>
              </>
            )}
            <div className="form-foot">
              <span />
              <span className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  새 버전 저장
                </button>
              </span>
            </div>
          </form>
        )}
      </section>

      {/* 2. A 승인 */}
      {view.spec && view.spec.intent !== 'question' && (
        <section className="wf-section">
          <h4>2. {GATE_LABEL.A}</h4>
          {view.spec.intent === 'ambiguous' ? (
            <p className="muted small">의도가 불분명합니다. ChatGPT의 확인 질문에 답한 뒤 기획서를 다시 저장하세요.</p>
          ) : view.aApproved ? (
            <p className="ok-text">v{view.spec.revision} 승인됨. 이 버전만 Claude PM에 전달됩니다.</p>
          ) : (
            <>
              {view.aStale && <p className="task-error">기획서가 바뀌어 이전 승인은 효력이 없습니다. v{view.spec.revision}을 다시 승인하세요.</p>}
              <div className="task-actions">
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  disabled={busy || !aCheck.ok}
                  onClick={() => void run(() => actions.decide(task, 'A', view.spec!.revision, 'approved'))}
                >
                  A 승인 (v{view.spec.revision})
                </button>
                <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => setShowAFeedback((v) => !v)}>
                  수정 요청(ChatGPT로)
                </button>
              </div>
              {showAFeedback && (
                <div className="wf-inline">
                  <input
                    id={`afb-${task.id}`}
                    placeholder="무엇을 고칠지 적어 주세요"
                    value={aFeedback}
                    onChange={(e) => setAFeedback(e.target.value)}
                    maxLength={2000}
                  />
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy || !aFeedback.trim()}
                    onClick={() =>
                      void run(async () => {
                        if (await actions.decide(task, 'A', view.spec!.revision, 'rejected', '', { feedback: aFeedback.trim() })) {
                          setAFeedback('');
                          setShowAFeedback(false);
                        }
                      })
                    }
                  >
                    수정 요청 기록
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 3. Claude PM */}
      {view.aApproved && (
        <section className="wf-section">
          <h4>3. Claude PM — 작업 분해·배정</h4>
          <p className="muted small">Claude는 계획만 만들고 저장소에 쓰지 않습니다. 세션이 시작돼도 계획이 오기 전까지는 완료가 아닙니다.</p>
          {!view.planCurrent && (
            <>
              {view.pendingRevision && (
                <p className="task-error">
                  결과 v{view.pendingRevision.resultRevision} 수정 요청: {view.pendingRevision.feedback} — PM에 다시 보내 새 계획을 받으세요.
                </p>
              )}
              {task.dispatch.sessionUrl && (
                <p className="task-session">
                  PM 세션:{' '}
                  <a href={task.dispatch.sessionUrl} target="_blank" rel="noreferrer">
                    열기
                  </a>{' '}
                  <span className="muted">— 마지막 메시지의 JSON을 복사해 아래에 붙여넣으세요.</span>
                </p>
              )}
              {!sentThisRevision && (
                <div className="dispatch">
                  {failed && (
                    <label className="check">
                      <input id={`ack-${task.id}`} type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                      Routines History에서 이전 실행이 없었음을 확인했습니다
                    </label>
                  )}
                  <button
                    type="button"
                    className="btn btn-claude"
                    disabled={busy || Boolean(dispatchBlocker) || (failed && !ack)}
                    onClick={() => void run(() => actions.dispatchPm(task, failed && ack))}
                  >
                    {view.pendingRevision ? `Claude PM에 수정 요청 전달 (v${view.spec!.revision})` : `Claude PM에 v${view.spec!.revision} 전달`}
                  </button>
                  {dispatchBlocker && <p className="muted small">{dispatchBlocker}</p>}
                </div>
              )}
              <label className="field">
                <span>PM 계획 JSON 붙여넣기</span>
                <textarea
                  id={`plan-${task.id}`}
                  rows={4}
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  placeholder='```json { "task_id": ..., "work_items": [...] } ```'
                  spellCheck={false}
                />
              </label>
              {planErrors && (
                <ul className="task-error small">
                  {planErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <div className="task-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || !planText.trim()}
                  onClick={() =>
                    void run(async () => {
                      const errors = await actions.importPlan(task, planText);
                      setPlanErrors(errors);
                      if (!errors) setPlanText('');
                    })
                  }
                >
                  계획 검증 후 저장
                </button>
              </div>
            </>
          )}
          {view.plan && view.planCurrent && (
            <p className="ok-text">
              계획 v{view.plan.planRevision} 저장됨 (기획서 v{view.plan.approvedSpecRevision} 기준
              {view.plan.targetBaseRevision ? `, main ${view.plan.targetBaseRevision.slice(0, 7)}` : ''})
            </p>
          )}
          {view.plan?.plan.status === 'needs_clarification' && view.planCurrent && (
            <div className="wf-pre">PM 질문: {view.plan.plan.questions.join(' / ')}</div>
          )}
        </section>
      )}

      {/* 4. 배정 + E 승인 */}
      {view.planCurrent && view.assignments.length > 0 && (
        <section className="wf-section">
          <h4>4. 배정된 작업 — {GATE_LABEL.E}</h4>
          <ul className="wf-items">
            {view.assignments.map((a) => {
              const item = view.plan!.plan.work_items.find((w) => w.id === a.workItemId);
              const adapter = adapterFor(a.assignee);
              const eOk = view.eApproved(a.workItemId);
              const eCheck = canApprove(view, 'E', a.workItemId);
              return (
                <li key={a.id} className="wf-item">
                  <div className="wf-item-head">
                    <b>
                      {a.workItemId} · {a.title}
                    </b>
                    <span className="pill">{adapter.label}</span>
                    <span className={`pill pill-adapter-${adapter.state}`}>{ADAPTER_STATE_LABEL[adapter.state]}</span>
                    <span className="pill">{DISPATCH_STATUS_LABEL[a.dispatchStatus]}</span>
                  </div>
                  {item?.goal && <p className="small">{item.goal}</p>}
                  {item && item.dependencies.length > 0 && <p className="muted small">먼저 끝나야 할 작업: {item.dependencies.join(', ')}</p>}

                  {/* 자동 실행: 검증된 경로만 버튼이 켜진다 */}
                  <button type="button" className="btn btn-small" disabled title={adapter.reason}>
                    {a.assignee === 'codex' ? 'Codex 실행 승인' : '실행 승인'} — 자동 실행 준비 중
                  </button>
                  <p className="muted small">{adapter.reason}</p>

                  {/* 임시 폴백: 수동 인계. 자동 실행 버튼처럼 보이지 않게 따로 둔다 */}
                  <div className="wf-manual">
                    <p className="small">
                      <b>수동 인계(임시)</b> — E 승인 후 지시서를 복사해 {a.assignee === 'codex' ? 'Codex Cloud 웹' : '해당 도구'}에서 직접 시작합니다.
                    </p>
                    {!eOk ? (
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        disabled={busy || !eCheck.ok}
                        onClick={() =>
                          void run(() =>
                            actions.decide(task, 'E', view.plan!.planRevision, 'approved', a.workItemId, {
                              assignee: a.assignee,
                              mode: 'manual_handoff',
                              plan_revision: view.plan!.planRevision,
                              spec_revision: view.spec!.revision,
                            }),
                          )
                        }
                      >
                        E 승인: 수동 인계로 진행
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-small btn-ghost"
                          onClick={() => item && void copy(a.id, buildCodexHandoff(task, view.spec!, item, project, view.plan!.targetBaseRevision, requestImages, taskLinks))}
                        >
                          {copied === a.id ? '복사됨' : '지시서 복사'}
                        </button>
                        {a.dispatchStatus === 'completed' ? (
                          <p className="small ok-text">결과를 받아 끝난 작업입니다.</p>
                        ) : a.dispatchStatus !== 'started' ? (
                          <span className="wf-inline">
                            {a.dispatchStatus === 'failed' && <span className="muted small">중단된 작업 · 다시 시작할 수 있습니다</span>}
                            <input
                              id={`start-${a.id}`}
                              placeholder="시작한 작업 주소(선택)"
                              value={startUrl[a.id] ?? ''}
                              onChange={(e) => setStartUrl({ ...startUrl, [a.id]: e.target.value })}
                            />
                            <button
                              type="button"
                              className="btn btn-small"
                              disabled={busy || !!startBlocker(a, allAssignments, view.plan, agentLimits)}
                              onClick={() => void run(() => actions.recordStart(a, startUrl[a.id] ?? ''))}
                            >
                              직접 시작했어요
                            </button>
                            {startBlocker(a, allAssignments, view.plan, agentLimits) && <span className="muted small">{startBlocker(a, allAssignments, view.plan, agentLimits)}</span>}
                          </span>
                        ) : (
                          <p className="small">
                            사용자 기록: 시작함{a.providerTaskUrl && (
                              <>
                                {' '}
                                ·{' '}
                                <a href={a.providerTaskUrl} target="_blank" rel="noreferrer">
                                  작업 열기
                                </a>
                              </>
                            )}{' '}
                            <span className="muted">(서버 확인 아님)</span>{' '}
                            <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(() => actions.stopAssignment(a))}>
                              중단 기록
                            </button>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 5. 결과 패키지 + B */}
      {view.aApproved && (view.planCurrent || view.result) && (
        <section className="wf-section">
          <h4>5. 결과 검토 — {GATE_LABEL.B}</h4>
          <p className="muted small">
            GitHub에 올리기 전에 여기서 diff와 테스트 결과를 봅니다. Codex 웹의 diff(또는 `codex cloud diff` 출력)를 붙여넣으세요. PR·푸시는 B 승인 뒤에만 합니다.
          </p>
          {view.result && (
            <div className="wf-result">
              <p>
                <b>결과 v{view.result.revision}</b>
                {view.result.workItemId && ` · ${view.result.workItemId}`} · {view.result.summary || '(요약 없음)'}
              </p>
              <p className="muted small mono">sha256 {view.result.sha256.slice(0, 16)}… · diff {view.result.diff.length.toLocaleString()}자 · 스크린샷 {resultShots.length}장 · 라이브 미리보기 미제공</p>
              {view.result.diff && <pre className="diff-view">{view.result.diff}</pre>}
              {view.result.testLog && (
                <details>
                  <summary className="small">테스트 로그</summary>
                  <pre className="diff-view">{view.result.testLog}</pre>
                </details>
              )}
              {view.result.remainingIssues && <p className="small">남은 문제: {view.result.remainingIssues}</p>}
              <AttachmentGallery
                items={resultShots}
                roles={ROLES_FOR.result}
                blocker={attachmentBlocker(view, 'result', 'add', resultShots.length, view.result.revision)}
                max={MAX_RESULT_FILES}
                urlFor={actions.attachmentUrl}
                onAdd={(files) => actions.addAttachments(task, 'result', view.result!.revision, files)}
                emptyText="결과 스크린샷 없음"
              />
            </div>
          )}
          {!view.bApproved && (
            <div className="task-actions">
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowResultForm((v) => !v)}>
                {view.result ? '수정 결과 새 버전 등록' : '결과 패키지 등록'}
              </button>
              {view.result && (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  disabled={busy || !bCheck.ok}
                  onClick={() => void run(() => actions.decide(task, 'B', view.result!.revision, 'approved', '', { result_sha256: view.result!.sha256 }))}
                >
                  B: GitHub 업로드 승인 (결과 v{view.result.revision})
                </button>
              )}
            </div>
          )}
          {view.result && !view.bApproved && (
            <div className="wf-manual">
              <p className="small">
                <b>수정 요청(Claude PM으로)</b> — 결과를 보고 고칠 점을 적으면, 같은 기획서 v{view.spec?.revision}로 PM에 다시 보내 새 계획을 받습니다. 새 계획의 작업은 E 승인을 다시 받습니다.
              </p>
              {view.pendingRevision ? (
                <p className="muted small">보낸 수정 요청: {view.pendingRevision.feedback}</p>
              ) : view.resultRevised ? (
                <p className="muted small">이 결과에는 수정 요청을 보냈습니다. 새 계획으로 작업한 결과를 새 버전으로 등록하세요.</p>
              ) : (
                <span className="wf-inline">
                  <input
                    id={`rev-${task.id}`}
                    placeholder="예: 버튼 색은 원래대로, 크기만 키우기"
                    value={revisionText}
                    onChange={(e) => setRevisionText(e.target.value)}
                    maxLength={4000}
                  />
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy || !revisionText.trim() || !revisionCheck.ok}
                    onClick={() =>
                      void run(async () => {
                        if (await actions.requestRevision(task, revisionText.trim())) setRevisionText('');
                      })
                    }
                  >
                    수정 요청 기록
                  </button>
                </span>
              )}
            </div>
          )}
          {showResultForm && !view.bApproved && (
            <form
              className="task-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (await actions.addResult(task, result, resultImages)) {
                    setShowResultForm(false);
                    setResult({ workItemId: '', summary: '', diff: '', testLog: '', remainingIssues: '' });
                    setResultImages([]);
                  }
                });
              }}
            >
              <div className="field-row">
                <label className="field">
                  <span>작업</span>
                  <select id={`ritem-${task.id}`} value={result.workItemId} onChange={(e) => setResult({ ...result, workItemId: e.target.value })}>
                    <option value="">전체</option>
                    {view.assignments.map((a) => (
                      <option key={a.id} value={a.workItemId}>
                        {a.workItemId} {a.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>요약</span>
                  <input id={`rsum-${task.id}`} value={result.summary} onChange={(e) => setResult({ ...result, summary: e.target.value })} maxLength={4000} />
                </label>
              </div>
              <label className="field">
                <span>diff (최대 500,000자)</span>
                <textarea id={`rdiff-${task.id}`} rows={6} value={result.diff} onChange={(e) => setResult({ ...result, diff: e.target.value })} maxLength={500000} spellCheck={false} />
              </label>
              <label className="field">
                <span>테스트 로그 (최대 100,000자)</span>
                <textarea id={`rlog-${task.id}`} rows={3} value={result.testLog} onChange={(e) => setResult({ ...result, testLog: e.target.value })} maxLength={100000} spellCheck={false} />
              </label>
              <label className="field">
                <span>남은 문제</span>
                <input id={`rissue-${task.id}`} value={result.remainingIssues} onChange={(e) => setResult({ ...result, remainingIssues: e.target.value })} maxLength={4000} />
              </label>
              <div className="field">
                <span>스크린샷 (변경 후·변경 전, {MAX_RESULT_FILES}장까지)</span>
                <ImagePicker items={resultImages} onChange={setResultImages} roles={ROLES_FOR.result} max={MAX_RESULT_FILES} label="스크린샷 추가" />
              </div>
              <div className="form-foot">
                <span className="muted small">개인정보·비밀키가 diff에 없는지 확인하세요.</span>
                <button type="submit" className="btn btn-primary" disabled={busy || (!result.diff.trim() && !result.summary.trim())}>
                  결과 저장
                </button>
              </div>
            </form>
          )}
          {view.bApproved && (
            <div className="wf-manual">
              <p className="ok-text">결과 v{view.result!.revision} 업로드 승인됨.</p>
              <p className="small">
                이제 Codex 웹에서 <b>PR 만들기</b>를 누르거나 Claude에게 "결과 v{view.result!.revision} 올려줘"라고 하세요. PR 주소를 기록해 두면 C 단계에서 씁니다.
              </p>
              {task.prUrl ? (
                <p className="small">
                  PR:{' '}
                  <a href={task.prUrl} target="_blank" rel="noreferrer">
                    {task.prUrl}
                  </a>
                </p>
              ) : (
                <span className="wf-inline">
                  <input id={`pr-${task.id}`} placeholder="https://github.com/…/pull/…" value={prUrl} onChange={(e) => setPrUrl(e.target.value)} />
                  <button type="button" className="btn btn-small" disabled={busy || !prUrl.startsWith('https://github.com/')} onClick={() => void run(() => actions.setPrUrl(task, prUrl))}>
                    PR 주소 기록
                  </button>
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* 6. C 운영 배포 */}
      {view.bApproved && (
        <section className="wf-section">
          <h4>6. {GATE_LABEL.C}</h4>
          {view.cApproved ? (
            <>
              <p className="ok-text">배포 승인됨. PC의 저장소 폴더에서 아래 두 줄을 실행하면 운영 사이트(release)에 반영됩니다.</p>
              <pre className="diff-view">{'git fetch origin\ngit push origin origin/main:refs/heads/release'}</pre>
            </>
          ) : (
            <>
              {actions.checkPr ? (
                <div className="wf-manual">
                  <p className="small">
                    <b>PR·CI 확인</b> — 서버가 GitHub에서 이 PR의 CI 결과와 병합 여부를 읽습니다. CI 성공 + main 병합이어야 C 승인을 할 수 있습니다.
                  </p>
                  {prCheck && (
                    <>
                      <p className="small">
                        <span className={`pill pill-ci-${prCheck.ciState}`}>CI {CI_LABEL[prCheck.ciState]}</span>{' '}
                        <span className={`pill ${prCheck.merged ? 'pill-ci-success' : 'pill-ci-pending'}`}>{prCheck.merged ? '병합됨' : prCheck.prState === 'closed' ? '닫힘(병합 안 됨)' : '병합 전'}</span>{' '}
                        <span className="muted">{new Date(prCheck.checkedAt).toLocaleString('ko-KR')} 확인</span>
                      </p>
                      {prCheck.checks.length > 0 && (
                        <ul className="small ci-list">
                          {prCheck.checks.map((c) => (
                            <li key={c.name}>
                              {c.name}: {c.status === 'completed' ? c.conclusion : c.status}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  <button type="button" className="btn btn-small" disabled={busy || !task.prUrl} onClick={() => void run(() => actions.checkPr!(task))}>
                    {prCheck ? 'PR·CI 다시 확인' : 'PR·CI 확인'}
                  </button>
                </div>
              ) : (
                <label className="check">
                  <input id={`ci-${task.id}`} type="checkbox" checked={ciChecked} onChange={(e) => setCiChecked(e.target.checked)} />
                  PR의 CI(verify) 통과와 main 병합을 확인했습니다 (로컬 데모: 서버 확인 없음)
                </label>
              )}
              <button
                type="button"
                className="btn btn-small btn-primary"
                disabled={busy || !cCheck.ok || !task.prUrl || (actions.checkPr ? !prCheckPasses(prCheck ?? null) : !ciChecked)}
                onClick={() => void run(() => actions.decide(task, 'C', view.result!.revision, 'approved', '', { pr_url: task.prUrl, ci: prCheck ? { state: prCheck.ciState, merged: prCheck.merged, sha: prCheck.headSha } : 'manual' }))}
              >
                C: 운영 배포 승인
              </button>
              {!task.prUrl && <p className="muted small">PR 주소를 먼저 기록하세요.</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
