import type { Task, TaskStatus } from './types';

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['in_progress', 'blocked'],
  in_progress: ['review', 'blocked', 'queued'],
  review: ['done', 'in_progress', 'blocked'],
  blocked: ['queued', 'in_progress'],
  done: ['review'],
};

export function nextStatuses(task: Pick<Task, 'status' | 'dispatch'>): TaskStatus[] {
  // 원격 실행이 진행 중이면 사람이 상태를 바꾸지 못하게 한다.
  if (task.dispatch.state === 'dispatching') return [];
  return TRANSITIONS[task.status];
}

export function canTransition(task: Pick<Task, 'status' | 'dispatch'>, to: TaskStatus): boolean {
  return nextStatuses(task).includes(to);
}
