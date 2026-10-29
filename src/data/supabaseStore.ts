import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Task, UsageRun } from '../domain/types';
import type { OfficeStore } from './store';

type Row = Record<string, unknown>;

const toProject = (r: Row): Project => ({
  id: r.id as string,
  name: r.name as string,
  repo: (r.repo as string | null) ?? null,
  description: (r.description as string) ?? '',
  createdAt: r.created_at as string,
});

const toTask = (r: Row): Task => ({
  id: r.id as string,
  projectId: r.project_id as string,
  title: r.title as string,
  description: (r.description as string) ?? '',
  type: r.type as Task['type'],
  requestedType: r.requested_type as Task['requestedType'],
  priority: r.priority as Task['priority'],
  assignee: r.assignee as Task['assignee'],
  routeReason: (r.route_reason as string) ?? '',
  status: r.status as Task['status'],
  dispatch: {
    state: r.dispatch_state as Task['dispatch']['state'],
    sessionUrl: (r.dispatch_session_url as string | null) ?? null,
    error: (r.dispatch_error as string | null) ?? null,
    at: (r.dispatch_at as string | null) ?? null,
  },
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

const toRun = (r: Row): UsageRun => ({
  id: r.id as string,
  agent: r.agent as UsageRun['agent'],
  taskId: (r.task_id as string | null) ?? null,
  kind: r.kind as UsageRun['kind'],
  day: r.day as string,
  createdAt: r.created_at as string,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseStore(client: SupabaseClient): OfficeStore {
  return {
    mode: 'supabase',
    async load() {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [projects, tasks, usage] = await Promise.all([
        client.from('projects').select('*').order('created_at'),
        client.from('tasks').select('*').order('created_at', { ascending: false }),
        client.from('usage_runs').select('*').gte('created_at', since),
      ]);
      return {
        projects: (check(projects) ?? []).map(toProject),
        tasks: (check(tasks) ?? []).map(toTask),
        usage: (check(usage) ?? []).map(toRun),
      };
    },
    async saveProject(p) {
      check(await client.from('projects').upsert({ id: p.id, name: p.name, repo: p.repo, description: p.description }));
    },
    async deleteProject(id) {
      check(await client.from('projects').delete().eq('id', id));
    },
    async saveTask(t) {
      // dispatch_* 열은 서버(Edge Function)만 바꾼다. DB 트리거도 클라이언트 변경을 무시한다.
      check(
        await client.from('tasks').upsert({
          id: t.id,
          project_id: t.projectId,
          title: t.title,
          description: t.description,
          type: t.type,
          requested_type: t.requestedType,
          priority: t.priority,
          assignee: t.assignee,
          route_reason: t.routeReason,
          status: t.status,
        }),
      );
    },
    async deleteTask(id) {
      check(await client.from('tasks').delete().eq('id', id));
    },
    async addManualRun(r) {
      check(await client.from('usage_runs').insert({ id: r.id, agent: r.agent, task_id: r.taskId, kind: 'manual' }));
    },
  };
}
