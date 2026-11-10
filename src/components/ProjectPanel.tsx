import type { ReactNode } from 'react';
import { repeatIssues } from '../domain/repeatIssues';
import type { Deployment, ResultReview } from '../domain/workflow-types';
import type { Shortcut } from '../domain/shortcuts';
import { BASE_RULES } from '../domain/baseRules';
import { useState } from 'react';
import type { Project, ProjectRule, Task } from '../domain/types';
import { RepoCreate } from './RepoCreate';
import { CODEX_ENV_URL, ROUTINES_URL, SUBMIT_HOST, type SetupIssues } from '../domain/projectSetup';
import { normalizeDemoUrl, PREVIEW_HOST_PATTERN, REPO_PATTERN, RULE_SOURCE_LABEL, siteUrl } from '../domain/types';

interface Props {
  projects: Project[];
  tasks: Task[];
  /** 프로젝트별 내 차례 수 */
  turnsByProject: Map<string, number>;
  /** 카드를 누르면 업무 탭에서 이 프로젝트 업무만 본다 */
  onOpen: (projectId: string) => void;
  /** 이 프로젝트로 대화 탭에서 요청하기 */
  onAsk?: (projectId: string) => void;
  /** id가 있으면 기존 프로젝트 수정, 없으면 새로 등록 */
  onSave: (p: { id?: string; name: string; repo: string | null; description: string; previewHost?: string | null; demoUrl?: string | null }) => Promise<unknown>;
  onDelete: (p: Project) => void;
  /** 저장소 만들기(Supabase 모드에서만) */
  onCreateRepo?: (project: Project, name: string) => Promise<string | null>;
  /** 이미 있는 저장소에 AI 작업 규칙 파일(CLAUDE.md) 넣기(Supabase 모드에서만, 없을 때만 넣음) */
  onAddRepoRules?: (project: Project) => void;
  /** 프로젝트에서 지켜야 할 것(v0.4.57): AI가 적고, 나는 지우거나 직접 더한다 */
  rules?: ProjectRule[];
  /** 결과 채점 기록(반복되는 문제 찾기, v0.5.41) */
  reviews?: ResultReview[];
  onAddRule?: (projectId: string, rule: string) => void;
  onRemoveRule?: (rule: ProjectRule) => void;
  /** 프로젝트 '한 일 기록'(v0.4.74): 펼쳤을 때만 그린다 */
  renderHistory?: (project: Project) => ReactNode;
  /** 구조도(v0.5.24): 펼쳤을 때만 그린다 */
  renderStructure?: (project: Project) => ReactNode;
  /** 앱 점검(v0.5.53): 저장소가 있는 프로젝트만, 펼쳤을 때만 그린다 */
  renderHealth?: (project: Project) => ReactNode;
  /** 디자인 기준(v0.5.56): 저장소가 있는 프로젝트만, 펼쳤을 때만 그린다 */
  renderDesign?: (project: Project) => ReactNode;
  /** 미뤄 둔 일(개발 AI가 남긴 shortcut 주석, v0.4.97) */
  shortcutsOf?: (projectId: string) => Shortcut[];
  onOpenTask?: (taskId: string) => void;
  /** 이 프로젝트의 마지막 운영 배포(v0.5.89) */
  lastDeployOf?: (project: Project) => Deployment | null;
  /** GitHub Pages 데모 주소(v0.5.91), Pages가 켜진 저장소만 */
  demoUrlOf?: (project: Project) => string | null;
  /** 준비 체크리스트의 막힌 흔적(v0.6.32) */
  setupIssuesOf?: (project: Project) => SetupIssues;
}

/**
 * 프로젝트 탭(v0.4.18, 소유자: "프로젝트가 뭐 있나 더 잘 보였으면"): 프로젝트를 큰 카드로 먼저 보이고,
 * 등록 칸은 "+ 새 프로젝트"를 눌렀을 때만, 삭제는 수정 안에 둔다.
 */
export function ProjectPanel({ projects, tasks, turnsByProject, onOpen, onAsk, onSave, onDelete, onCreateRepo, onAddRepoRules, rules = [], reviews = [], onAddRule, onRemoveRule, renderHistory, renderStructure, renderHealth, renderDesign, shortcutsOf, onOpenTask, lastDeployOf, demoUrlOf, setupIssuesOf }: Props) {
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [structureOpen, setStructureOpen] = useState<Record<string, boolean>>({});
  const [healthOpen, setHealthOpen] = useState<Record<string, boolean>>({});
  const [designOpen, setDesignOpen] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [description, setDescription] = useState('');
  const [previewHost, setPreviewHost] = useState('');
  const [demoText, setDemoText] = useState('');
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [repoFor, setRepoFor] = useState<string | null>(null);
  const editing = projects.find((p) => p.id === editingId) ?? null;
  const repoValid = repo.trim() === '' || REPO_PATTERN.test(repo.trim());
  const hostValue = previewHost.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const hostValid = hostValue === '' || PREVIEW_HOST_PATTERN.test(hostValue);
  const demoValue = normalizeDemoUrl(demoText);
  const demoValid = demoText.trim() === '' || demoValue !== null;

  const reset = () => {
    setEditingId(null);
    setFormOpen(false);
    setConfirmDelete(false);
    setName('');
    setRepo('');
    setDescription('');
    setPreviewHost('');
    setDemoText('');
  };

  const startEdit = (p: Project) => {
    setConfirmDelete(false);
    setEditingId(p.id);
    setFormOpen(true);
    setName(p.name);
    setRepo(p.repo ?? '');
    setDescription(p.description);
    setPreviewHost(p.previewHost ?? '');
    setDemoText(p.demoUrl ?? '');
    window.setTimeout(() => document.getElementById('project-name')?.focus(), 50);
  };

  const editingCount = editing ? tasks.filter((t) => t.projectId === editing.id).length : 0;

  return (
    <div className="stack">
      <div className="project-head">
        <h3 className="project-title">프로젝트 {projects.length}개</h3>
        {!formOpen && (
          <button type="button" className="btn btn-small btn-primary" onClick={() => setFormOpen(true)}>
            + 새 프로젝트
          </button>
        )}
      </div>

      {formOpen && (
        <form
          className="task-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || !repoValid || !hostValid || !demoValid) return;
            await onSave({
              id: editing?.id,
              name: name.trim(),
              repo: repo.trim() || null,
              description: description.trim(),
              // 운영 DB에 칸이 없던 프로젝트(undefined)는 비워 둔 채면 보내지 않는다
              ...(editing?.previewHost !== undefined || hostValue ? { previewHost: hostValue || null } : {}),
              ...(editing?.demoUrl !== undefined || demoValue ? { demoUrl: demoValue } : {}),
            });
            reset();
          }}
        >
          <p className="form-title">{editing ? `${editing.name} 수정` : '새 프로젝트'}</p>
          <div className="field-row">
            <label className="field">
              <span>프로젝트 이름</span>
              <input id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
            </label>
            <label className="field">
              <span>GitHub 저장소</span>
              <input
                id="project-repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/repo"
                aria-invalid={!repoValid}
                spellCheck={false}
              />
            </label>
          </div>
          <label className="field">
            <span>설명</span>
            <input id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </label>
          <label className="field">
            <span>운영 주소 · Cloudflare(선택)</span>
            <input
              id="project-preview"
              value={previewHost}
              onChange={(e) => setPreviewHost(e.target.value)}
              placeholder="예: my-app.pages.dev"
              aria-invalid={!hostValid}
              spellCheck={false}
              autoCapitalize="off"
            />
          </label>
          <label className="field">
            <span>데모 주소 · GitHub Pages(선택)</span>
            <input
              id="project-demo"
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              placeholder="예: minho-nim.github.io/my-app/"
              aria-invalid={!demoValid}
              spellCheck={false}
              autoCapitalize="off"
            />
          </label>
          <div className="form-foot">
            <p className={repoValid && hostValid && demoValid ? 'route-preview' : 'task-error'}>
              {!repoValid
                ? 'owner/repo 형식으로 입력하세요. 예: minho-nim/minoffia'
                : !hostValid
                  ? '운영 주소는 my-app.pages.dev처럼 주소 이름만 적어요.'
                  : !demoValid
                    ? '데모 주소는 minho-nim.github.io/my-app/처럼 적어요.'
                    : '운영 주소를 적으면 카드의 "운영"과 개발 결과의 "미리보기 열기"가, 데모 주소를 적으면 "데모"가 열려요. 데모를 비워 두면 GitHub Pages가 켜진 저장소는 자동으로 찾아요.'}
            </p>
            <span className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={reset}>
                취소
              </button>
              <button type="submit" className="btn btn-primary" disabled={!name.trim() || !repoValid || !hostValid || !demoValid}>
                {editing ? '변경 저장' : '프로젝트 등록'}
              </button>
            </span>
          </div>
          {editing &&
            (confirmDelete ? (
              <span className="confirm">
                업무 {editingCount}건도 함께 지워집니다.
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => {
                    onDelete(editing);
                    reset();
                  }}
                >
                  삭제
                </button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmDelete(false)}>
                  취소
                </button>
              </span>
            ) : (
              <button type="button" className="link-btn small project-delete" onClick={() => setConfirmDelete(true)}>
                이 프로젝트 삭제
              </button>
            ))}
        </form>
      )}

      {projects.length === 0 && <p className="empty">아직 프로젝트가 없어요. "+ 새 프로젝트"로 만들거나 대화 탭에서 요청하면 만들 수 있어요.</p>}

      <ul className="project-cards">
        {projects.map((p) => {
          const mine = tasks.filter((t) => t.projectId === p.id);
          const open = mine.filter((t) => t.status !== 'done').length;
          const turn = turnsByProject.get(p.id) ?? 0;
          const mineRules = rules.filter((r) => r.projectId === p.id);
          const draft = ruleDraft[p.id] ?? '';
          const site = siteUrl(p);
          const demo = p.demoUrl || (demoUrlOf?.(p) ?? null);
          const deploy = lastDeployOf?.(p) ?? null;
          return (
            <li key={p.id} className="project-card">
              <button type="button" className="project-open" onClick={() => onOpen(p.id)} aria-label={`${p.name} 업무 보기`}>
                <span className="project-name">
                  {p.name}
                  {p.sample && <span className="sample-tag">예시</span>}
                  {turn > 0 && (
                    <span className="num num-turn" aria-label={`내 차례 ${turn}개`}>
                      {turn}
                    </span>
                  )}
                </span>
                {p.description && <span className="project-desc">{p.description}</span>}
                <span className="project-meta">
                  <span>열린 업무 {open}</span>
                  <span>전체 {mine.length}</span>
                  <span className={p.repo ? 'project-repo is-on' : 'project-repo'}>{p.repo ?? '저장소 없음'}</span>
                </span>
              </button>
              <span className="project-tools">
                <button type="button" className="btn btn-small btn-ghost" onClick={() => onOpen(p.id)}>
                  업무 보기
                </button>
                {/* 운영·데모 두 칸은 늘 보인다(v0.5.92). 주소가 없으면 눌러서 수정 칸으로 */}
                {([['운영', site], ['데모', demo]] as const).map(([label, url]) =>
                  url ? (
                    <a key={label} className="btn btn-small btn-ghost project-site" href={url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} ${label} 새 창으로 열기`}>
                      {label} ↗
                    </a>
                  ) : null, // v0.6.43: 주소가 없으면 숨김(수정에서 적으면 생김)
                )}
                {onAsk && (
                  <button type="button" className="btn btn-small btn-primary" onClick={() => onAsk(p.id)}>
                    요청하기
                  </button>
                )}
                {onCreateRepo && !p.repo && !p.sample && repoFor !== p.id && (
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setRepoFor(p.id)}>
                    저장소 만들기
                  </button>
                )}
                <button type="button" className="btn btn-small btn-ghost" onClick={() => startEdit(p)}>
                  수정
                </button>
              </span>
              {deploy && (
                <p className="muted small project-deploy">
                  {deploy.ok ? '마지막 운영 배포' : '마지막 배포 실패'} · {new Date(deploy.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {deploy.ok ? ` · ${deploy.toSha.slice(0, 7)}` : ''}
                  {!site && deploy.ok ? ' · 수정에서 주소를 적으면 바로 열 수 있어요' : ''}
                </p>
              )}
              {/* 덜 복잡하게(v0.6.41 소유자 "구조도 열어 보기 힘들어, 읽을 게 너무 많아"): 칸들을 한 줄 버튼으로, 누르면 전체 화면으로 열린다 */}
              <div className="project-sections">
              {p.repo && !p.sample && <ProjectSetup project={p} issues={setupIssuesOf?.(p) ?? { codex: null, claude: null }} />}
              {renderHistory && (
                <details className="project-rules project-history-box" onToggle={(e) => { const open = (e.currentTarget as HTMLDetailsElement).open; setHistoryOpen((o) => ({ ...o, [p.id]: open })); }}>
                  <summary>📜 한 일 기록</summary>
                  {historyOpen[p.id] && renderHistory(p)}
                </details>
              )}
              {renderStructure && (
                <details className="project-rules project-structure" onToggle={(e) => { const open = (e.currentTarget as HTMLDetailsElement).open; setStructureOpen((o) => ({ ...o, [p.id]: open })); }}>
                  <summary>🗺️ 구조도</summary>
                  {structureOpen[p.id] && renderStructure(p)}
                </details>
              )}
              {renderHealth && p.repo && (
                <details className="project-rules project-health" onToggle={(e) => { const open = (e.currentTarget as HTMLDetailsElement).open; setHealthOpen((o) => ({ ...o, [p.id]: open })); }}>
                  <summary>🩺 앱 지도·점검</summary>
                  {healthOpen[p.id] && renderHealth(p)}
                </details>
              )}
              {renderDesign && p.repo && (
                <details className="project-rules project-design" onToggle={(e) => { const open = (e.currentTarget as HTMLDetailsElement).open; setDesignOpen((o) => ({ ...o, [p.id]: open })); }}>
                  <summary>🎨 디자인{p.designMd ? '' : '(없음)'}</summary>
                  {designOpen[p.id] && renderDesign(p)}
                </details>
              )}
              {(() => {
                const debts = shortcutsOf?.(p.id) ?? [];
                if (!debts.length) return null;
                return (
                  <details className="project-rules project-debt">
                    <summary>
                      ⏳ 미뤄 둔 일 <span className="num num-count">{debts.length}</span>
                    </summary>
                    <p className="muted small">개발 AI가 알고 일부러 줄인 곳이에요(코드의 shortcut 주석). 때가 되면 업무로 만들어 고치세요.</p>
                    <ul>
                      {debts.map((d, i) => (
                        <li key={`${d.taskId}-${i}`}>
                          <span>
                            {d.text}
                            {d.noTrigger && <span className="pill pill-warn"> 언제 고칠지 없음</span>}
                            <br />
                            <span className="muted small">
                              {d.file} ·{' '}
                              {onOpenTask ? (
                                <button type="button" className="link-btn small" onClick={() => onOpenTask(d.taskId)}>
                                  {d.taskTitle}
                                </button>
                              ) : (
                                d.taskTitle
                              )}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })()}
              {(
                <details className="project-rules">
                  <summary>
                    📏 규칙 <span className="num num-count">{mineRules.length}</span>
                  </summary>
                  <details className="project-base-rules">
                    <summary className="small">기본 규칙(모든 프로젝트에 늘 적용) {BASE_RULES.length}</summary>
                    <ul>
                      {BASE_RULES.map((r) => (
                        <li key={r}>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <p className="muted small">기본 규칙은 모든 프로젝트에 늘 들어가요. 아래는 AI가 접수·계획·개발을 하며 이 프로젝트에서만 계속 지킬 것을 적어 둔 것이고, 다음 기획서·계획·개발 지시서에 함께 넣어요. 틀린 건 지우세요.</p>
                  {onAddRepoRules && p.repo && (
                    <button type="button" className="link-btn small" onClick={() => onAddRepoRules(p)}>
                      저장소 CLAUDE.md 지금 맞추기 — 없으면 넣고, 다르면 '지켜야 할 것'만 맞춤(개발할 때는 AI가 알아서 맞춰요)
                    </button>
                  )}
                  {/* 반복되는 문제(v0.5.41): 채점에서 서로 다른 결과 2번 이상 나온 위반·고칠 점 */}
                  {onAddRule &&
                    (() => {
                      const repeats = repeatIssues(reviews, tasks, p.id, mineRules.map((r) => r.rule));
                      return repeats.length > 0 ? (
                        <div className="wf-warn">
                          <b>채점에서 반복되는 문제</b> — 지켜야 할 것에 넣으면 다음 지시서부터 함께 가요.
                          <ul>
                            {repeats.map((x) => (
                              <li key={x.text}>
                                {x.text} <span className="muted small">({x.count}번)</span>{' '}
                                <button type="button" className="link-btn small" onClick={() => onAddRule(p.id, x.text)}>
                                  지켜야 할 것에 추가
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null;
                    })()}
                  {mineRules.length > 0 ? (
                    <ul>
                      {mineRules.map((r) => (
                        <li key={r.id}>
                          <span>{r.rule}</span>
                          <span className="muted small">{RULE_SOURCE_LABEL[r.source]}</span>
                          {onRemoveRule && (
                            <button type="button" className="link-btn small" onClick={() => onRemoveRule(r)} aria-label={`${r.rule} 지우기`}>
                              지우기
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">아직 없어요.</p>
                  )}
                  {onAddRule && (
                    <form
                      className="project-rule-add"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.trim().length < 2) return;
                        onAddRule(p.id, draft);
                        setRuleDraft((d) => ({ ...d, [p.id]: '' }));
                      }}
                    >
                      <input
                        value={draft}
                        onChange={(e) => setRuleDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                        maxLength={200}
                        placeholder="직접 더하기(예: 금지: console.log · 금지 파일: CLAUDE.md)"
                        title="'금지: 글자'·'금지 파일: 경로'로 쓰면 AI 없이 결과를 자동 검사해요(어기면 다시 개발). '주의:'는 경고만."
                        aria-label={`${p.name}에서 지켜야 할 것 더하기`}
                      />
                      <button type="submit" className="btn btn-small btn-ghost" disabled={draft.trim().length < 2}>
                        더하기
                      </button>
                    </form>
                  )}
                </details>
              )}
              </div>
              {repoFor === p.id && onCreateRepo && (
                <RepoCreate
                  project={p}
                  onCancel={() => setRepoFor(null)}
                  onCreate={async (project, name) => {
                    const repo = await onCreateRepo(project, name);
                    if (repo) setRepoFor(null);
                    return repo;
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 준비 체크리스트(v0.6.32 소유자 "새로 만든 건 또 이 작업을 해야 하나"): 자동으로 못 하는 설정만 모아 링크·복사로 바로 하게.
 *  체크 표시는 이 기기에만 기억한다(화면 편의, 막힌 흔적은 업무 기록으로 따로 알린다). */
function ProjectSetup({ project, issues }: { project: Project; issues: SetupIssues }) {
  const key = (k: string) => `setup:${project.id}:${k}`;
  const read = (k: string) => {
    try {
      return localStorage.getItem(key(k)) === '1';
    } catch {
      return false;
    }
  };
  const [done, setDone] = useState(() => ({ codex: read('codex'), claude: read('claude') }));
  const [copied, setCopied] = useState(false);
  const flip = (k: 'codex' | 'claude') => {
    const v = !done[k];
    setDone((d) => ({ ...d, [k]: v }));
    try {
      localStorage.setItem(key(k), v ? '1' : '0');
    } catch {
      // 저장 못 해도 화면은 그대로
    }
  };
  const codexOk = done.codex && !issues.codex;
  const claudeOk = done.claude && !issues.claude;
  const count = 1 + Number(codexOk) + Number(claudeOk);
  return (
    <details className="project-rules project-setup">
      <summary>
        ✅ 준비 {count}/3{issues.codex || issues.claude ? ' ⚠' : ''}
      </summary>
      <ul className="setup-list small">
        <li className="is-ok">✓ 저장소 연결: {project.repo}</li>
        <li className={codexOk ? 'is-ok' : issues.codex ? 'is-bad' : ''}>
          <label className="check">
            <input type="checkbox" checked={done.codex} onChange={() => flip('codex')} /> Codex 환경 만들고 게시(프로젝트마다 한 번)
          </label>
          {issues.codex && <b className="warn-text"> — {issues.codex}</b>}
          <span className="setup-actions">
            <a href={CODEX_ENV_URL} target="_blank" rel="noreferrer">
              Codex 환경 열기 ↗
            </a>
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(SUBMIT_HOST).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }, () => undefined);
              }}
            >
              {copied ? '복사됨' : '허용 도메인 복사'}
            </button>
          </span>
          <span className="muted"> 저장소 {project.repo} 선택 → 추가 허용 도메인에 붙여 넣기 → 게시</span>
        </li>
        <li className={claudeOk ? 'is-ok' : issues.claude ? 'is-bad' : ''}>
          <label className="check">
            <input type="checkbox" checked={done.claude} onChange={() => flip('claude')} /> Claude 루틴에 이 저장소 추가
          </label>
          {issues.claude && <b className="warn-text"> — {issues.claude}</b>}
          <span className="setup-actions">
            <a href={ROUTINES_URL} target="_blank" rel="noreferrer">
              Claude 루틴 열기 ↗
            </a>
          </span>
          <span className="muted"> 루틴 "MinLab AI Office 보조 개발" → 저장소에 {project.repo} 추가 → 저장</span>
        </li>
      </ul>
      <p className="muted small">없어도 업무는 멈추지 않아요: Codex 환경이 없으면 Claude가 이어받아요.</p>
    </details>
  );
}
