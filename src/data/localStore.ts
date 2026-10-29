import type { Snapshot } from '../domain/types';
import { sampleSnapshot } from './sample';
import type { OfficeStore } from './store';

const KEY = 'minlab-ai-office:v1';

function read(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

function write(s: Snapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 저장소가 막힌 환경(비공개 창 등)에서는 이번 화면에서만 유지된다.
  }
}

export function createLocalStore(): OfficeStore {
  let state: Snapshot = read() ?? sampleSnapshot();
  const commit = (next: Snapshot) => {
    state = next;
    write(state);
  };
  return {
    mode: 'local',
    async load() {
      return state;
    },
    async saveProject(project) {
      const exists = state.projects.some((p) => p.id === project.id);
      commit({
        ...state,
        projects: exists ? state.projects.map((p) => (p.id === project.id ? project : p)) : [...state.projects, project],
      });
    },
    async deleteProject(id) {
      commit({
        ...state,
        projects: state.projects.filter((p) => p.id !== id),
        tasks: state.tasks.filter((t) => t.projectId !== id),
      });
    },
    async saveTask(task) {
      const exists = state.tasks.some((t) => t.id === task.id);
      commit({
        ...state,
        tasks: exists ? state.tasks.map((t) => (t.id === task.id ? task : t)) : [task, ...state.tasks],
      });
    },
    async deleteTask(id) {
      commit({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });
    },
    async addManualRun(run) {
      commit({ ...state, usage: [...state.usage, run] });
    },
  };
}

export function resetLocalDemo(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
