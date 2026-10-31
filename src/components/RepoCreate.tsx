import { useState } from 'react';
import { repoNameError, toRepoSlug } from '../../supabase/functions/create-repo/naming';
import type { Project } from '../domain/types';

interface Props {
  project: Project;
  /** 성공하면 만든 저장소(owner/repo), 실패하면 null(이유는 App 알림) */
  onCreate: (project: Project, name: string) => Promise<string | null>;
  onCancel?: () => void;
}

/** 새 프로젝트의 GitHub 저장소 만들기(비공개, README만). 버튼을 눌러야만 만든다. */
export function RepoCreate({ project, onCreate, onCancel }: Props) {
  const [name, setName] = useState(toRepoSlug(project.name));
  const [busy, setBusy] = useState(false);
  const error = repoNameError(name);
  return (
    <form
      className="wf-inline repo-create"
      onSubmit={(e) => {
        e.preventDefault();
        if (error || busy) return;
        setBusy(true);
        void onCreate(project, name.trim()).finally(() => setBusy(false));
      }}
    >
      <input id={`repo-${project.id}`} value={name} maxLength={100} spellCheck={false} placeholder="저장소 이름(영문)" aria-invalid={error ? true : undefined} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn btn-small btn-primary" disabled={busy || !!error}>
        {busy ? '만드는 중…' : '비공개 저장소 만들기'}
      </button>
      {onCancel && (
        <button type="button" className="btn btn-small btn-ghost" onClick={onCancel}>
          나중에
        </button>
      )}
      <span className={error ? 'task-error small' : 'muted small'}>{error ?? 'README만 있는 빈 비공개 저장소를 만들고 이 프로젝트에 연결합니다. 코드는 올리기 승인 뒤에만 올라갑니다.'}</span>
    </form>
  );
}
