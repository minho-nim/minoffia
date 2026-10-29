import { useState } from 'react';
import type { Project, Task } from '../domain/types';
import { RepoCreate } from './RepoCreate';
import { REPO_PATTERN } from '../domain/types';

interface Props {
  projects: Project[];
  tasks: Task[];
  /** id가 있으면 기존 프로젝트 수정, 없으면 새로 등록 */
  onSave: (p: { id?: string; name: string; repo: string | null; description: string }) => Promise<unknown>;
  onDelete: (p: Project) => void;
  /** 저장소 만들기(Supabase 모드에서만) */
  onCreateRepo?: (project: Project, name: string) => Promise<string | null>;
}

export function ProjectPanel({ projects, tasks, onSave, onDelete, onCreateRepo }: Props) {
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [description, setDescription] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [repoFor, setRepoFor] = useState<string | null>(null);
  const editing = projects.find((p) => p.id === editingId) ?? null;
  const repoValid = repo.trim() === '' || REPO_PATTERN.test(repo.trim());

  const reset = () => {
    setEditingId(null);
    setName('');
    setRepo('');
    setDescription('');
  };

  const startEdit = (p: Project) => {
    setConfirmId(null);
    setEditingId(p.id);
    setName(p.name);
    setRepo(p.repo ?? '');
    setDescription(p.description);
  };

  return (
    <div className="stack">
      <form
        className="task-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || !repoValid) return;
          await onSave({ id: editing?.id, name: name.trim(), repo: repo.trim() || null, description: description.trim() });
          reset();
        }}
      >
        {editing && <p className="form-title">{editing.name} 수정 중</p>}
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
        <div className="form-foot">
          <p className={repoValid ? 'route-preview' : 'task-error'}>
            {repoValid ? '저장소는 owner/repo 형식. 비워두면 연결 없는 프로젝트가 됩니다.' : 'owner/repo 형식으로 입력하세요. 예: minho-nim/MinLab-AI-Office'}
          </p>
          <span className="form-actions">
            {editing && (
              <button type="button" className="btn btn-ghost" onClick={reset}>
                취소
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || !repoValid}>
              {editing ? '변경 저장' : '프로젝트 등록'}
            </button>
          </span>
        </div>
      </form>

      <ul className="project-list">
        {projects.map((p) => {
          const count = tasks.filter((t) => t.projectId === p.id).length;
          return (
            <li key={p.id} className="project-row">
              <div className="project-main">
                <b>{p.name}</b>
                {p.sample && <span className="sample-tag">예시</span>}
                <span className="mono small">{p.repo ?? '저장소 미연결'}</span>
                {p.description && <span className="muted small">{p.description}</span>}
              </div>
              <span className="muted small">업무 {count}</span>
              {onCreateRepo && !p.repo && !p.sample && repoFor !== p.id && (
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setRepoFor(p.id)}>
                  저장소 만들기
                </button>
              )}
              <button type="button" className="btn btn-small btn-ghost" onClick={() => startEdit(p)}>
                수정
              </button>
              {confirmId === p.id ? (
                <span className="confirm">
                  업무 {count}건도 함께 지워집니다.
                  <button type="button" className="btn btn-small btn-danger" onClick={() => onDelete(p)}>
                    삭제
                  </button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmId(null)}>
                    취소
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirmId(p.id)}>
                  삭제
                </button>
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
