import { useState } from 'react';
import { AGENT_BY_ID } from '../domain/agents';
import { MAX_REQUEST_FILES, ROLES_FOR } from '../domain/attachments';
import { routeTask } from '../domain/router';
import type { AgentId, Priority, Project, RequestedType, UsageRun } from '../domain/types';
import { PRIORITY_LABEL, WORK_TYPE_LABEL } from '../domain/types';
import { ImagePicker, type PendingImage } from './Attachments';

export interface TaskDraft {
  projectId: string;
  title: string;
  description: string;
  requestedType: RequestedType;
  priority: Priority;
  /** 입력창에서 온 요청이면 사용자가 쓴 글 전체(원문 보존) */
  originalText?: string;
}

interface Props {
  projects: Project[];
  usage: UsageRun[];
  /** 휴가 중인 AI(배정 미리보기에서 뺀다) */
  leave?: AgentId[];
  /** 이미지는 업무를 저장한 뒤 비공개 저장소에 올린다. */
  onSubmit: (draft: TaskDraft, images: PendingImage[]) => Promise<unknown>;
}

export function TaskForm({ projects, usage, leave = [], onSubmit }: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestedType, setRequestedType] = useState<RequestedType>('auto');
  const [priority, setPriority] = useState<Priority>('normal');
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<PendingImage[]>([]);

  const pid = projects.some((p) => p.id === projectId) ? projectId : projects[0]?.id ?? '';
  const preview = title.trim() ? routeTask({ title, description, requestedType }, usage, new Date(), leave) : null;

  if (projects.length === 0) {
    return <p className="empty">업무를 받으려면 먼저 프로젝트 탭에서 프로젝트를 등록하세요.</p>;
  }

  return (
    <form
      className="task-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !pid) return;
        setBusy(true);
        try {
          await onSubmit({ projectId: pid, title: title.trim(), description, requestedType, priority }, images);
          setImages([]);
          setTitle('');
          setDescription('');
          setRequestedType('auto');
          setPriority('normal');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>할 일</span>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 로그인 화면 버그 수정"
          maxLength={120}
          required
        />
      </label>
      <label className="field">
        <span>설명</span>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="완료 기준, 참고 링크"
          maxLength={2000}
        />
      </label>
      <div className="field">
        <span>이미지 (현재 화면·목표 디자인·오류 화면, {MAX_REQUEST_FILES}장까지)</span>
        <ImagePicker items={images} onChange={setImages} roles={ROLES_FOR.request} max={MAX_REQUEST_FILES} label="이미지·문서 추가" allowDocs />
      </div>
      <div className="field-row">
        <label className="field">
          <span>프로젝트</span>
          <select id="task-project" value={pid} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>유형</span>
          <select id="task-type" value={requestedType} onChange={(e) => setRequestedType(e.target.value as RequestedType)}>
            <option value="auto">자동 분류</option>
            {Object.entries(WORK_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>우선순위</span>
          <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-foot">
        <p className="route-preview" aria-live="polite">
          {preview ? (
            <>
              배정 예정 <b>{AGENT_BY_ID[preview.assignee].name}</b> · {preview.reason}
            </>
          ) : (
            '할 일을 적으면 미니엉이 규칙으로 담당자를 고릅니다.'
          )}
        </p>
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
          {busy ? (images.length ? '접수·이미지 올리는 중' : '접수 중') : '업무 접수'}
        </button>
      </div>
    </form>
  );
}
