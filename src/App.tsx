import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPanel } from './components/AgentPanel';
import { Login } from './components/Login';
import { ProjectPanel } from './components/ProjectPanel';
import { TaskCard } from './components/TaskCard';
import { TaskForm, type TaskDraft } from './components/TaskForm';
import { createLocalStore, resetLocalDemo } from './data/localStore';
import { newId, type OfficeStore } from './data/store';
import { AGENT_BY_ID, AGENTS } from './domain/agents';
import { buildHandoff } from './domain/handoff';
import { routeTask } from './domain/router';
import { canTransition } from './domain/status';
import type { AgentId, Project, Snapshot, Task, TaskStatus } from './domain/types';
import { STATUS_LABEL } from './domain/types';
import { kstDay, runsToday } from './domain/usage';
import { dispatchClaude } from './lib/dispatch';
import { getSupabase } from './lib/supabase';
import { OfficeView } from './office/OfficeView';

type Tab = 'tasks' | 'projects' | 'agent';
type Filter = 'open' | 'all' | TaskStatus;

const EMPTY: Snapshot = { projects: [], tasks: [], usage: [] };
const POLL_MS = 15_000;

export function App() {
  const [booting, setBooting] = useState(true);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<OfficeStore | null>(null);
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [tab, setTab] = useState<Tab>('tasks');
  const [filter, setFilter] = useState<Filter>('open');
  const [selected, setSelected] = useState<AgentId | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [handoff, setHandoff] = useState<string | null>(null);
  const handoffRef = useRef<HTMLTextAreaElement>(null);

  const say = useCallback((kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  }, []);

  // 시작: Supabase 설정이 없으면 로컬 데모 모드
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = await getSupabase();
      if (cancelled) return;
      if (!sb) {
        const local = createLocalStore();
        setStore(local);
        setSnap(await local.load());
        setBooting(false);
        return;
      }
      setClient(sb);
      const { data } = await sb.auth.getSession();
      setSession(data.session);
      sb.auth.onAuthStateChange((_e, s) => setSession(s));
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 로그인하면 Supabase 저장소로 전환
  useEffect(() => {
    if (!client || !session) return;
    let alive = true;
    void import('./data/supabaseStore').then(({ createSupabaseStore }) => {
      if (alive) setStore(createSupabaseStore(client));
    });
    return () => {
      alive = false;
    };
  }, [client, session]);

  const reload = useCallback(async () => {
    if (!store) return;
    try {
      setSnap(await store.load());
    } catch (e) {
      say('error', `불러오기 실패: ${(e as Error).message}`);
    }
  }, [store, say]);

  useEffect(() => {
    if (!store) return;
    void reload();
    if (store.mode !== 'supabase') return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [store, reload]);

  useEffect(() => {
    if (handoff) handoffRef.current?.select();
  }, [handoff]);

  const projectById = useMemo(() => new Map(snap.projects.map((p) => [p.id, p])), [snap.projects]);

  const visibleTasks = useMemo(() => {
    const list = snap.tasks.filter((t) => {
      if (filter === 'all') return true;
      if (filter === 'open') return t.status !== 'done';
      return t.status === filter;
    });
    return list;
  }, [snap.tasks, filter]);

  if (booting) return <main className="boot">오피스를 여는 중…</main>;
  if (client && !session) return <Login client={client} />;
  if (!store) return <main className="boot">업무를 불러오는 중…</main>;

  const mutate = async (fn: () => Promise<void>, ok?: string) => {
    try {
      await fn();
      setSnap(await store.load());
      if (ok) say('ok', ok);
    } catch (e) {
      say('error', `저장하지 못했습니다: ${(e as Error).message}`);
    }
  };

  const addTask = async (d: TaskDraft) => {
    const route = routeTask(d, snap.usage);
    const now = new Date().toISOString();
    const task: Task = {
      id: newId(),
      projectId: d.projectId,
      title: d.title,
      description: d.description,
      type: route.type,
      requestedType: d.requestedType,
      priority: d.priority,
      assignee: route.assignee,
      routeReason: route.reason,
      status: 'queued',
      dispatch: { state: 'none' },
      createdAt: now,
      updatedAt: now,
    };
    await mutate(() => store.saveTask(task), `${AGENT_BY_ID[route.assignee].name}에게 배정했습니다.`);
  };

  const setStatus = (task: Task, to: TaskStatus) => {
    if (!canTransition(task, to)) return;
    const agent = AGENT_BY_ID[task.assignee];
    void mutate(async () => {
      await store.saveTask({ ...task, status: to, updatedAt: new Date().toISOString() });
      // 수동 인계 에이전트는 사람이 실제로 맡긴 시점(진행 시작)을 실행 1회로 기록한다.
      if (to === 'in_progress' && agent.mode === 'manual') {
        await store.addManualRun({
          id: newId(),
          agent: agent.id,
          taskId: task.id,
          kind: 'manual',
          day: kstDay(),
          createdAt: new Date().toISOString(),
        });
      }
    }, `${task.title}: ${STATUS_LABEL[to]}`);
  };

  const copyHandoff = async (task: Task) => {
    const text = buildHandoff(task, projectById.get(task.projectId));
    try {
      await navigator.clipboard.writeText(text);
      setHandoff(null);
      return true;
    } catch {
      setHandoff(text);
      return false;
    }
  };

  const dispatchBlocker = (task: Task): string | null => {
    if (store.mode === 'local' || !client) return '로컬 데모에서는 실행할 수 없습니다. Supabase와 Edge Function을 연결해야 합니다.';
    const project = projectById.get(task.projectId);
    if (!project?.repo) return '프로젝트에 GitHub 저장소(owner/repo)를 먼저 입력하세요.';
    if (runsToday(snap.usage, 'claude') >= (AGENT_BY_ID.claude.dailyCap ?? 0)) return '오늘 Claude Cloud 실행 2회를 모두 썼습니다.';
    return null;
  };

  const dispatch = async (task: Task, ack: boolean) => {
    if (!client) return;
    const res = await dispatchClaude(client, task.id, ack);
    await reload();
    if (res.ok) say('ok', 'Claude Cloud 세션을 시작했습니다. 세션 링크에서 진행 상황을 확인하세요.');
    else say('error', `실행하지 못했습니다: ${res.error ?? '알 수 없는 오류'}`);
  };

  const saveProject = async (p: { name: string; repo: string | null; description: string }) => {
    const project: Project = { id: newId(), ...p, createdAt: new Date().toISOString() };
    await mutate(() => store.saveProject(project), `${p.name} 프로젝트를 등록했습니다.`);
  };

  const selectAgent = (id: AgentId) => {
    setSelected((cur) => (cur === id && tab === 'agent' ? null : id));
    setTab('agent');
  };

  const openCount = snap.tasks.filter((t) => t.status !== 'done').length;
  const counts = (s: TaskStatus) => snap.tasks.filter((t) => t.status === s).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand">
            MINLAB AI OFFICE <span className="ver">v0.1</span>
          </h1>
          {store.mode === 'local' ? (
            <span className="mode mode-local" title="데이터는 이 브라우저의 localStorage에만 저장됩니다">
              로컬 데모 · 이 기기에만 저장
            </span>
          ) : (
            <span className="mode mode-cloud">
              Supabase 동기화 · {session?.user.email}
              <button type="button" className="link-btn" onClick={() => void client?.auth.signOut()}>
                로그아웃
              </button>
            </span>
          )}
        </div>
        <ul className="usage" aria-label="오늘 등록된 실행 횟수">
          {AGENTS.filter((a) => a.dailyCap !== null).map((a) => {
            const used = runsToday(snap.usage, a.id);
            const cap = a.dailyCap ?? 0;
            return (
              <li key={a.id} className={used >= cap ? 'is-full' : ''}>
                <span>{a.name}</span>
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
                </span>
                <span className="num">
                  {used}/{cap}
                </span>
              </li>
            );
          })}
        </ul>
      </header>

      <main className="layout">
        <section className="stage" aria-label="오피스">
          <OfficeView tasks={snap.tasks} selected={selected} onSelect={selectAgent} />
          <p className="stage-note">
            캐릭터 위치와 말풍선은 업무 상태만 따릅니다. 진행 중이면 책상, 다른 방 일이면 도우러 가고, 열린 업무가 없으면 휴게실로 갑니다. 캐릭터를 누르면 상세가 열립니다.
          </p>
        </section>

        <aside className="panel">
          <nav className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'tasks'} onClick={() => setTab('tasks')}>
              업무 <span className="num">{openCount}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'projects'} onClick={() => setTab('projects')}>
              프로젝트 <span className="num">{snap.projects.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'agent'}
              onClick={() => {
                setSelected((s) => s ?? 'mina');
                setTab('agent');
              }}
            >
              에이전트
            </button>
          </nav>

          {notice && (
            <p className={`notice notice-${notice.kind}`} role="status">
              {notice.text}
            </p>
          )}

          {handoff && (
            <div className="handoff">
              <label className="field">
                <span>지시서 (선택된 상태입니다. Ctrl+C로 복사)</span>
                <textarea id="handoff-text" ref={handoffRef} readOnly value={handoff} rows={8} />
              </label>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setHandoff(null)}>
                닫기
              </button>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="stack">
              <TaskForm projects={snap.projects} usage={snap.usage} onSubmit={addTask} />
              <div className="filters" role="group" aria-label="업무 필터">
                {(
                  [
                    ['open', `열린 업무 ${openCount}`],
                    ['all', `전체 ${snap.tasks.length}`],
                    ...(['queued', 'in_progress', 'review', 'blocked', 'done'] as TaskStatus[]).map(
                      (s) => [s, `${STATUS_LABEL[s]} ${counts(s)}`] as [Filter, string],
                    ),
                  ] as [Filter, string][]
                ).map(([k, label]) => (
                  <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {visibleTasks.length === 0 ? (
                <p className="empty">이 조건의 업무가 없습니다.</p>
              ) : (
                visibleTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    project={projectById.get(t.projectId)}
                    dispatchBlocker={dispatchBlocker(t)}
                    onStatus={setStatus}
                    onDelete={(task) => void mutate(() => store.deleteTask(task.id), '업무를 삭제했습니다.')}
                    onCopy={copyHandoff}
                    onDispatch={dispatch}
                  />
                ))
              )}
            </div>
          )}

          {tab === 'projects' && (
            <ProjectPanel
              projects={snap.projects}
              tasks={snap.tasks}
              onSave={saveProject}
              onDelete={(p) => void mutate(() => store.deleteProject(p.id), `${p.name} 프로젝트를 삭제했습니다.`)}
            />
          )}

          {tab === 'agent' && selected && (
            <AgentPanel
              agentId={selected}
              tasks={snap.tasks}
              usage={snap.usage}
              onOpenTask={() => {
                setFilter('all');
                setTab('tasks');
              }}
            />
          )}

          {store.mode === 'local' && (
            <footer className="panel-foot">
              <button
                type="button"
                className="link-btn small"
                onClick={() => {
                  resetLocalDemo();
                  window.location.reload();
                }}
              >
                예시 데이터로 초기화
              </button>
            </footer>
          )}
        </aside>
      </main>
    </div>
  );
}
