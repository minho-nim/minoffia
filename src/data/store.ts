import type { Attachment } from '../domain/attachments';
import type { Clarification, LinkRef } from '../domain/requestContext';
import type { Project, Snapshot, Task, UsageRun } from '../domain/types';
import type { AgentAssignment, Approval, PmPlan, ResultPackage, RevisionRequest, TaskSpec } from '../domain/workflow-types';

export type StoreMode = 'local' | 'supabase';

export interface OfficeStore {
  mode: StoreMode;
  load(): Promise<Snapshot>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  saveTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  /** 수동 실행 기록. Cloud 실행은 서버만 기록한다. */
  addManualRun(run: UsageRun): Promise<void>;
  /** 아래는 추가만 가능한 감사 기록. 규칙 위반은 오류로 거절된다(Supabase는 DB 트리거가 판단). */
  addSpec(spec: TaskSpec): Promise<void>;
  addApproval(approval: Approval): Promise<void>;
  addPlan(plan: PmPlan, assignments: AgentAssignment[]): Promise<void>;
  updateAssignment(assignment: AgentAssignment): Promise<void>;
  addResult(result: ResultPackage): Promise<void>;
  /** 결과 검토 → Claude PM 수정 요청 */
  addRevisionRequest(request: RevisionRequest): Promise<void>;
  /**
   * 이미지 첨부. 파일을 비공개 저장소에 올린 뒤 기록을 남긴다. 같은 업무의 같은 파일(sha256)은 한 번만 저장한다.
   * `storagePath`는 저장소가 정한다.
   */
  addAttachment(attachment: Omit<Attachment, 'storagePath'>, file: Blob): Promise<void>;
  /** 요청 자료의 순서·역할·설명만 바꾼다. */
  updateAttachment(attachment: Attachment): Promise<void>;
  deleteAttachment(attachment: Attachment): Promise<void>;
  /** 화면에 보여 줄 주소. Supabase는 1시간 뒤 만료된다. */
  attachmentUrl(attachment: Attachment): Promise<string>;
  /** 서버가 링크를 한 번 읽고 결과를 기록한다(로컬 데모는 지원하지 않음). */
  readLink(taskId: string, url: string): Promise<LinkRef>;
  deleteLink(link: LinkRef): Promise<void>;
  /** GPT 확인 질문·답변(추가만) */
  addClarification(item: Clarification): Promise<void>;
  /** 입력창 일반 질문을 Gemini 무료 API에 묻는다(서버가 키·하루 상한을 관리). 로컬 데모는 지원하지 않음. */
  /** 새 프로젝트의 GitHub 저장소를 서버가 만들고 연결한다(로컬 데모는 지원하지 않음). */
  createRepo(projectId: string, name: string): Promise<{ repo: string; url: string; warning?: string }>;
  askGemini(question: string, history: { role: 'user' | 'model'; text: string }[]): Promise<{ answer: string; keySlot: number }>;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
