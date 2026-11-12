// 스킬 탭(v0.6.55, 소유자 "설정 탭 왼쪽에 skills 탭, 내용과 설명을 보게"): 이 저장소 .claude/skills의 스킬을 목록으로,
// 누르면 가운데 팝업으로 내용을 본다(프로젝트 칸과 같은 팝업, 바깥 누르면 닫힘). 읽기는 GitHub만, AI 호출 없음.
// 만들기·찾기는 작은 입력 창(v0.6.57)에 쓰고 보내면 대화로 바로 보낸다. 결과는 늘 PR(올리기 승인)로 들어온다.
import { useEffect, useMemo, useState } from 'react';
import { SkillMap, type SkillMapMode } from './SkillMap';
import { INSTALL_LABEL, RISK_LABEL, SKILL_AREAS, SKILL_CATEGORIES, SKILL_PRESETS, skillRequest, toSkillView, type SkillCategory, type SkillFile, type SkillInstallState } from '../domain/skills';

const EMPTY = { what: '', when: '', rules: '', areas: [] as string[], isDefault: false, category: '' };

export interface SkillProject {
  id: string;
  name: string;
  repo: string;
}

export function SkillsPanel({ load, onSend, canRequest, projects = [], status, install, usage = new Map(), prefill, mapLoad, installRequest }: {
  /** force = '다시 읽기'(저장해 둔 것 말고 새로) */
  load: (force?: boolean) => Promise<SkillFile[]>;
  onSend: (text: string) => void;
  canRequest: boolean;
  /** 스킬을 넣을 수 있는 프로젝트(저장소 있는 것, MinLab 제외) */
  projects?: SkillProject[];
  status?: (skill: string) => Promise<Record<string, SkillInstallState>>;
  install?: (skill: string, projectIds: string[], mode?: 'add' | 'remove') => Promise<{ started: string[]; failed: string[] }>;
  /** 스킬별 쓰인 업무 수(결과 요약의 '쓴 스킬', v0.6.59) */
  usage?: Map<string, number>;
  /** 다른 곳(반복되는 문제)에서 넘어온 스킬 만들기 내용. n이 바뀔 때마다 만들기 창을 연다(v0.6.59) */
  prefill?: { what: string; rules: string; n: number } | null;
  /** 그림 지도용 프로젝트별 스킬 상태(v0.6.62) */
  mapLoad?: () => Promise<import('../domain/skills').SkillMapData>;
  /** 다른 곳(프로젝트 칸)에서 넘어온 넣기 창 열기(v0.6.66). n이 바뀔 때마다 */
  installRequest?: { name: string; n: number } | null;
}) {
  // 스킬 지도(v0.6.63 소유자 "프로젝트의 지도 보기처럼"): 앱 지도와 같은 큰 팝업으로 연다. 열 때만 프로젝트 상태를 읽는다
  const [mapOpen, setMapOpen] = useState<SkillMapMode | null>(null);
  const view = 'list' as const;
  // 프로젝트에 넣기 창(v0.6.58): 스킬 하나를 골라 프로젝트마다 들어 있는지 보고, 고른 곳에 넣는다
  const [installFor, setInstallFor] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, SkillInstallState> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [installMsg, setInstallMsg] = useState('');
  const [installing, setInstalling] = useState(false);
  const openInstall = (skill: string) => {
    setInstallFor(skill);
    setStates(null);
    setInstallMsg('');
    status?.(skill).then(
      (s) => {
        setStates(s);
        // 없거나 옛 버전인 곳을 미리 골라 둔다
        setPicked(new Set(projects.filter((p) => s[p.id] !== 'same').map((p) => p.id)));
      },
      (e) => {
        setStates({});
        setInstallMsg((e as Error).message || '상태를 읽지 못했어요.');
      },
    );
  };
  // 빼기는 들어 있는 곳(들어 있음·옛 버전) 중 고른 곳만(v0.6.60)
  const removable = [...picked].filter((id) => states?.[id] === 'same' || states?.[id] === 'old');
  useEffect(() => {
    if (installRequest && install && projects.length > 0) openInstall(installRequest.name);
  }, [installRequest?.n]);
  const doInstall = async (mode: 'add' | 'remove' = 'add') => {
    const ids = mode === 'remove' ? removable : [...picked];
    if (!installFor || !install || ids.length === 0) return;
    setInstalling(true);
    setInstallMsg('');
    try {
      const r = await install(installFor, ids, mode);
      setInstallMsg(
        `${r.started.length}곳에서 ${mode === 'remove' ? '빼기' : '넣기'}를 시작했어요(GitHub Actions, 1~2분). 끝나면 각 저장소에 PR이 열리고 바로 병합돼요.${r.failed.length ? ` 시작 못 함: ${r.failed.join(', ')}` : ''} 잠시 뒤 다시 열면 상태가 바뀌어 있어요.`,
      );
    } catch (e) {
      setInstallMsg((e as Error).message || '넣지 못했어요.');
    } finally {
      setInstalling(false);
    }
  };
  const [form, setForm] = useState<'make' | 'find' | null>(null);
  // 바깥을 눌러 창이 닫혀도 쓴 글은 남겨 둔다(다시 열면 그대로)
  const [fields, setFields] = useState(EMPTY);
  const ready = fields.what.trim().length >= 2;
  useEffect(() => {
    if (!prefill) return;
    setFields({ ...EMPTY, what: prefill.what, rules: prefill.rules });
    setForm('make');
  }, [prefill?.n]);
  const send = () => {
    if (!form || !ready) return;
    onSend(skillRequest({ kind: form, ...fields }));
    setFields(EMPTY);
    setForm(null);
  };
  const [files, setFiles] = useState<SkillFile[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const refresh = (force = false) => {
    setError('');
    setFiles(null);
    load(force).then(setFiles, (e) => {
      setError((e as Error).message || '스킬을 읽지 못했어요.');
      setFiles([]);
    });
  };
  useEffect(() => refresh(), []);
  const skills = useMemo(() => (files ?? []).map(toSkillView), [files]);

  // 스킬 지도(v0.6.61): 분류 칩·검색으로 좁히고, 분류별로 묶어 보인다. 도구 스킬은 '전체'에서는 맨 아래 접어 둔다
  const [cat, setCat] = useState<'all' | SkillCategory>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (s: (typeof skills)[number]) => !q || `${s.title} ${s.name} ${s.description}`.toLowerCase().includes(q);
  const counts = new Map<SkillCategory, number>();
  for (const s of skills) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  const shown = skills.filter((s) => (cat === 'all' || s.category === cat) && matches(s));
  const foldTools = cat === 'all' && !q;
  const used = shown.filter((s) => !(foldTools && s.meta));
  const tools = foldTools ? shown.filter((s) => s.meta) : [];
  const groups = SKILL_CATEGORIES.map((c) => [c, used.filter((s) => s.category === c)] as const).filter(([, list]) => list.length > 0);
  const card = (s: (typeof skills)[number]) => (
    <li key={s.name} className="skill-card">
      <div className="skill-top">
        <b>{s.title}</b>
        {s.title !== s.name && <span className="muted small">{s.name}</span>}
        <span className="pill">{s.license}</span>
        <span className="muted small">{s.source}</span>
      </div>
      <p className="skill-desc small">{s.description || '설명 없음'}</p>
      <div className="skill-meta small">
        <span>{usage.get(s.name) ? `쓰인 업무 ${usage.get(s.name)}` : s.meta ? '' : '아직 안 쓰임'}</span>
      <span>파일 {s.files.length}{s.scripts ? ` · 스크립트 ${s.scripts}` : ''}</span>
        {s.meta && <span className="pill">도구 · 미노피아 전용</span>}
        {s.isDefault && <span className="pill" title="새 프로젝트 저장소를 만들 때 자동으로 넣어요">기본</span>}
        {s.risks.map((r) => (
          <span key={r} className="pill pill-warn" title="내용에 이런 글자가 있어요. 꼭 위험한 건 아니고, 읽어 볼 곳이에요.">
            {RISK_LABEL[r]}
          </span>
        ))}
      </div>
      {/* 내용은 가운데 팝업(project-sections 팝업 그대로: ✕·바깥 누르면 닫힘, 열린 동안 뒤 화면 잠금) */}
      <div className="project-sections skill-buttons">
        {!s.meta && install && projects.length > 0 && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => openInstall(s.name)}>
            프로젝트에 넣기
          </button>
        )}
        <details open={open === s.name} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open ? s.name : open === s.name ? null : open)}>
          <summary>내용 보기</summary>
          {open === s.name && (
            <div className="skill-body">
              <p className="small">
                <b>{s.title}</b> · {s.license} · {s.source}
              </p>
              <p className="small">{s.description}</p>
              <pre>{s.body}</pre>
              <p className="muted small">파일: {s.files.join(', ')}</p>
            </div>
          )}
        </details>
      </div>
    </li>
  );
  return (
    <div className="stack skills-panel">
      <div className="skills-head">
        <h3>스킬 {files ? skills.length : ''}</h3>
        <span className="skills-actions">
          <button type="button" className="btn btn-small btn-primary" disabled={!canRequest} onClick={() => setForm('make')}>
            만들기
          </button>
          <button type="button" className="btn btn-small btn-ghost" disabled={!canRequest} onClick={() => setForm('find')}>
            찾기
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => refresh(true)} aria-label="스킬 목록 다시 읽기">
            새로 읽기
          </button>
        </span>
      </div>
      <p className="muted small">
        AI가 개발할 때 꺼내 쓰는 작업 설명서예요(원본: minoffia-skills 저장소). 만들기·찾기에 짧게 적어 보내면 대화로 접수되고, Claude가 만든 스킬은 올리기 승인 뒤 PR로 들어와요.
      </p>
      {/* 프로젝트에 넣기 창(v0.6.58) */}
      <div className="project-sections skill-form-pop">
        <details open={installFor !== null} onToggle={(e) => !(e.currentTarget as HTMLDetailsElement).open && setInstallFor(null)}>
          <summary>프로젝트에 넣기{installFor ? ` · ${skills.find((x) => x.name === installFor)?.title ?? installFor}` : ''}</summary>
          {installFor && (
            <div className="skill-form">
              <p className="muted small">고른 프로젝트 저장소의 .agents/skills(Codex 등)와 .claude/skills(Claude)에 이 스킬을 넣어요. 그 뒤로는 그 프로젝트에서 일하는 AI가 필요할 때 알아서 꺼내 써요.</p>
              {states === null ? (
                <p className="muted small">프로젝트마다 들어 있는지 확인하는 중…</p>
              ) : (
                <ul className="skill-projects">
                  {projects.map((p) => {
                    const st = states[p.id];
                    return (
                      <li key={p.id}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={picked.has(p.id)}
                            onChange={() =>
                              setPicked((cur) => {
                                const next = new Set(cur);
                                if (!next.delete(p.id)) next.add(p.id);
                                return next;
                              })
                            }
                          />{' '}
                          {p.name}
                        </label>
                        <span className={`pill${st === 'same' ? '' : st === 'old' ? ' pill-warn' : ''}`}>{st ? INSTALL_LABEL[st] : '확인 못 함'}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {installMsg && <p className="small">{installMsg}</p>}
              <div className="form-foot">
                <span />
                <span className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setInstallFor(null)}>
                    닫기
                  </button>
                  {removable.length > 0 && (
                    <button type="button" className="btn btn-ghost" disabled={installing || states === null} onClick={() => void doInstall('remove')}>
                      {removable.length}곳에서 빼기
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" disabled={installing || picked.size === 0 || states === null} onClick={() => void doInstall('add')}>
                    {picked.size}곳에 넣기
                  </button>
                </span>
              </div>
            </div>
          )}
        </details>
      </div>
      {/* 입력 창: 프로젝트 칸과 같은 가운데 팝업(✕·바깥 누르면 닫힘). 닫혀 있을 때는 숨김 */}
      <div className="project-sections skill-form-pop">
        <details open={form !== null} onToggle={(e) => !(e.currentTarget as HTMLDetailsElement).open && setForm(null)}>
          <summary>{form === 'find' ? '스킬 찾기' : '스킬 만들기'}</summary>
          {form && (
            <form
              className="skill-form"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {form === 'make' && (
                <div className="skill-presets">
                  <span className="muted small">자주 쓰는 것:</span>
                  {SKILL_PRESETS.map((p) => (
                    <button key={p.label} type="button" className="chip" onClick={() => setFields({ ...fields, what: p.what, when: p.when, rules: p.rules })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              <label className="field">
                <span>{form === 'make' ? '무엇을 하는 스킬?' : '어떤 일에 쓸 스킬?'} (필수)</span>
                <input id="skill-what" value={fields.what} maxLength={200} onChange={(e) => setFields({ ...fields, what: e.target.value })} placeholder={form === 'make' ? '예: 배포 순서를 자동으로 진행' : '예: 화면 접근성 검사'} autoFocus />
              </label>
              {form === 'make' ? (
                <>
                  <label className="field">
                    <span>언제 쓰면 좋을까? (선택)</span>
                    <input id="skill-when" value={fields.when} maxLength={200} onChange={(e) => setFields({ ...fields, when: e.target.value })} placeholder='예: "배포해줘"라고 할 때' />
                  </label>
                  <label className="field">
                    <span>분류 (선택, 비우면 낱말로 고름)</span>
                    <select id="skill-category" value={fields.category} onChange={(e) => setFields({ ...fields, category: e.target.value })}>
                      <option value="">자동</option>
                      {SKILL_CATEGORIES.filter((c) => c !== '도구').map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check small">
                    <input id="skill-default" type="checkbox" checked={fields.isDefault} onChange={(e) => setFields({ ...fields, isDefault: e.target.checked })} /> 새 프로젝트에 늘 넣기(기본 스킬)
                  </label>
                  <label className="field">
                    <span>꼭 지킬 순서·규칙 (선택, 여러 줄)</span>
                    <textarea id="skill-rules" rows={3} value={fields.rules} maxLength={600} onChange={(e) => setFields({ ...fields, rules: e.target.value })} placeholder="예: PR → 검사 → 병합 → 배포" />
                  </label>
                </>
              ) : (
                <div className="skill-presets" role="group" aria-label="분야">
                  <span className="muted small">분야:</span>
                  {SKILL_AREAS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="chip"
                      aria-pressed={fields.areas.includes(a)}
                      onClick={() => setFields({ ...fields, areas: fields.areas.includes(a) ? fields.areas.filter((x) => x !== a) : [...fields.areas, a] })}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
              <details className="small">
                <summary>보낼 내용 미리 보기</summary>
                <pre className="skill-preview">{skillRequest({ kind: form, ...fields })}</pre>
              </details>
              <div className="form-foot">
                <span />
                <span className="form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
                    취소
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={!ready}>
                    {form === 'make' ? '요청 보내기' : '찾아 달라고 하기'}
                  </button>
                </span>
              </div>
            </form>
          )}
        </details>
      </div>
      {!canRequest && <p className="muted small">만들기·찾기는 저장소가 minho-nim/minoffia-skills(또는 minoffia)인 프로젝트가 있어야 해요.</p>}
      {error && <p className="task-error small">{error}</p>}
      {files === null && <p className="muted small">스킬을 읽는 중…</p>}
      {files && skills.length === 0 && !error && <p className="empty">아직 스킬이 없어요.</p>}
      {skills.length > 0 && (
        <div className="map-buttons skill-map-open">
          <button type="button" className="btn btn-small btn-primary" onClick={() => setMapOpen('brief')}>
            간략 지도
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setMapOpen('detail')}>
            자세한 지도
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setMapOpen('tree')}>
            구조도
          </button>
        </div>
      )}
      {mapOpen && (
        <div className="archify-modal" role="dialog" aria-label="스킬 지도" onClick={() => setMapOpen(null)}>
          <div className="archify-box skill-map-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="archify-close" onClick={() => setMapOpen(null)} aria-label="닫기">
              ×
            </button>
            <p className="appmap-title">{mapOpen === 'brief' ? '간략 지도' : mapOpen === 'tree' ? '구조도' : '자세한 지도'}</p>
            <div className="skill-map-tabs" role="tablist" aria-label="지도 보기">
              {(['brief', 'detail', 'tree'] as const).map((m) => (
                <button key={m} type="button" role="tab" className="chip" aria-pressed={mapOpen === m} onClick={() => setMapOpen(m)}>
                  {m === 'brief' ? '간략' : m === 'detail' ? '자세히' : '구조도'}
                </button>
              ))}
            </div>
            <SkillMap
              mode={mapOpen}
              skills={skills}
              usage={usage}
              projects={projects}
              load={mapLoad}
              onPick={
                install && projects.length > 0
                  ? (name) => {
                      setMapOpen(null);
                      openInstall(name);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}
      {view === 'list' && skills.length > 0 && (
        <div className="skill-map">
          <div className="skill-cats" role="group" aria-label="스킬 분류">
            <button type="button" className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
              전체 {skills.length}
            </button>
            {SKILL_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? 'all' : c)}>
                {c} {counts.get(c)}
              </button>
            ))}
          </div>
          <input id="skill-search" className="skill-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="스킬 찾기: 이름·설명 낱말" aria-label="스킬 검색" />
        </div>
      )}
      {view === 'list' && files && skills.length > 0 && shown.length === 0 && <p className="muted small">맞는 스킬이 없어요.</p>}
      {view === 'list' && groups.map(([c, list]) => (
        <section key={c} className="skill-group" aria-label={`${c} ${list.length}개`}>
          <h4 className="skill-group-title">
            {c} <span className="num num-count">{list.length}</span>
          </h4>
          <ul className="skill-list">{list.map(card)}</ul>
        </section>
      ))}
      {/* 도구 스킬(스킬 만들기·찾기)은 접어 둔다(v0.6.59): 실제로 쓰는 스킬만 먼저 보이게 */}
      {view === 'list' && tools.length > 0 && (
        <details className="skill-tools">
          <summary className="small">도구 스킬 {tools.length}개 (스킬을 만들고 찾는 데 쓰는 것)</summary>
          <ul className="skill-list">{tools.map(card)}</ul>
        </details>
      )}
    </div>
  );
}
