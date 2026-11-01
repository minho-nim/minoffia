import { useState } from 'react';
import type { Project, ProjectRule, Task } from '../domain/types';
import { RepoCreate } from './RepoCreate';
import { PREVIEW_HOST_PATTERN, REPO_PATTERN, RULE_SOURCE_LABEL } from '../domain/types';

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
  onSave: (p: { id?: string; name: string; repo: string | null; description: string; previewHost?: string | null }) => Promise<unknown>;
  onDelete: (p: Project) => void;
  /** 저장소 만들기(Supabase 모드에서만) */
  onCreateRepo?: (project: Project, name: string) => Promise<string | null>;
  /** 이미 있는 저장소에 AI 작업 규칙 파일(CLAUDE.md) 넣기(Supabase 모드에서만, 없을 때만 넣음) */
  onAddRepoRules?: (project: Project) => void;
  /** 프로젝트에서 지켜야 할 것(v0.4.57): AI가 적고, 나는 지우거나 직접 더한다 */
  rules?: ProjectRule[];
  onAddRule?: (projectId: string, rule: string) => void;
  onRemoveRule?: (rule: ProjectRule) => void;
}

/**
 * 프로젝트 탭(v0.4.18, 소유자: "프로젝트가 뭐 있나 더 잘 보였으면"): 프로젝트를 큰 카드로 먼저 보이고,
 * 등록 칸은 "+ 새 프로젝트"를 눌렀을 때만, 삭제는 수정 안에 둔다.
 */
export function ProjectPanel({ projects, tasks, turnsByProject, onOpen, onAsk, onSave, onDelete, onCreateRepo, onAddRepoRules, rules = [], onAddRule, onRemoveRule }: Props) {
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [description, setDescription] = useState('');
  const [previewHost, setPreviewHost] = useState('');
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [repoFor, setRepoFor] = useState<string | null>(null);
  const editing = projects.find((p) => p.id === editingId) ?? null;
  const repoValid = repo.trim() === '' || REPO_PATTERN.test(repo.trim());
  const hostValue = previewHost.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const hostValid = hostValue === '' || PREVIEW_HOST_PATTERN.test(hostValue);

  const reset = () => {
    setEditingId(null);
    setFormOpen(false);
    setConfirmDelete(false);
    setName('');
    setRepo('');
    setDescription('');
    setPreviewHost('');
  };

  const startEdit = (p: Project) => {
    setConfirmDelete(false);
    setEditingId(p.id);
    setFormOpen(true);
    setName(p.name);
    setRepo(p.repo ?? '');
    setDescription(p.description);
    setPreviewHost(p.previewHost ?? '');
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
            if (!name.trim() || !repoValid || !hostValid) return;
            await onSave({
              id: editing?.id,
              name: name.trim(),
              repo: repo.trim() || null,
              description: description.trim(),
              // 운영 DB에 칸이 없던 프로젝트(undefined)는 비워 둔 채면 보내지 않는다
              ...(editing?.previewHost !== undefined || hostValue ? { previewHost: hostValue || null } : {}),
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
            <span>미리보기 주소(선택)</span>
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
          <div className="form-foot">
            <p className={repoValid && hostValid ? 'route-preview' : 'task-error'}>
              {!repoValid
                ? 'owner/repo 형식으로 입력하세요. 예: minho-nim/MinLab-AI-Office'
                : !hostValid
                  ? '미리보기 주소는 my-app.pages.dev처럼 주소 이름만 적어요.'
                  : '저장소는 owner/repo 형식. 미리보기 주소(Cloudflare Pages)를 적으면 Claude 결과에 "미리보기 열기"가 붙어요.'}
            </p>
            <span className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={reset}>
                취소
              </button>
              <button type="submit" className="btn btn-primary" disabled={!name.trim() || !repoValid || !hostValid}>
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
              {(onAddRule || mineRules.length > 0) && (
                <details className="project-rules">
                  <summary>
                    지켜야 할 것 <span className="num num-count">{mineRules.length}</span>
                  </summary>
                  <p className="muted small">AI가 접수·계획·개발을 하며 이 프로젝트에서 계속 지킬 것을 적어 두고, 다음 기획서·계획·개발 지시서에 함께 넣어요. 틀린 건 지우세요.</p>
                  {onAddRepoRules && p.repo && (
                    <button type="button" className="link-btn small" onClick={() => onAddRepoRules(p)}>
                      저장소에 AI 작업 규칙 파일(CLAUDE.md) 넣기 — 없을 때만
                    </button>
                  )}
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
                        placeholder="직접 더하기(선택)"
                        aria-label={`${p.name}에서 지켜야 할 것 더하기`}
                      />
                      <button type="submit" className="btn btn-small btn-ghost" disabled={draft.trim().length < 2}>
                        더하기
                      </button>
                    </form>
                  )}
                </details>
              )}
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
