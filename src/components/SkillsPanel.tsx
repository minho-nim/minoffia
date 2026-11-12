// 스킬 탭(v0.6.55, 소유자 "설정 탭 왼쪽에 skills 탭, 내용과 설명을 보게"): 이 저장소 .claude/skills의 스킬을 목록으로,
// 누르면 가운데 팝업으로 내용을 본다(프로젝트 칸과 같은 팝업, 바깥 누르면 닫힘). 읽기는 GitHub만, AI 호출 없음.
// 만들기·찾기는 작은 입력 창(v0.6.57)에 쓰고 보내면 대화로 바로 보낸다. 결과는 늘 PR(올리기 승인)로 들어온다.
import { useEffect, useMemo, useState } from 'react';
import { RISK_LABEL, SKILL_AREAS, SKILL_PRESETS, skillRequest, toSkillView, type SkillFile } from '../domain/skills';

const EMPTY = { what: '', when: '', rules: '', areas: [] as string[] };

export function SkillsPanel({ load, onSend, canRequest }: { load: () => Promise<SkillFile[]>; onSend: (text: string) => void; canRequest: boolean }) {
  const [form, setForm] = useState<'make' | 'find' | null>(null);
  // 바깥을 눌러 창이 닫혀도 쓴 글은 남겨 둔다(다시 열면 그대로)
  const [fields, setFields] = useState(EMPTY);
  const ready = fields.what.trim().length >= 2;
  const send = () => {
    if (!form || !ready) return;
    onSend(skillRequest({ kind: form, ...fields }));
    setFields(EMPTY);
    setForm(null);
  };
  const [files, setFiles] = useState<SkillFile[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => {
    setError('');
    setFiles(null);
    load().then(setFiles, (e) => {
      setError((e as Error).message || '스킬을 읽지 못했어요.');
      setFiles([]);
    });
  };
  useEffect(refresh, []);
  const skills = useMemo(() => (files ?? []).map(toSkillView), [files]);

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
          <button type="button" className="btn btn-small btn-ghost" onClick={refresh} aria-label="스킬 목록 다시 읽기">
            새로 읽기
          </button>
        </span>
      </div>
      <p className="muted small">
        Claude가 이 저장소에서 일할 때 쓰는 작업 설명서예요. 만들기·찾기에 짧게 적어 보내면 대화로 접수되고, Claude가 만든 스킬은 올리기 승인 뒤 PR로 들어와요.
      </p>
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
      {!canRequest && <p className="muted small">만들기·찾기는 저장소가 minho-nim/minoffia인 프로젝트가 있어야 해요.</p>}
      {error && <p className="task-error small">{error}</p>}
      {files === null && <p className="muted small">스킬을 읽는 중…</p>}
      {files && skills.length === 0 && !error && <p className="empty">아직 스킬이 없어요.</p>}
      <ul className="skill-list">
        {skills.map((s) => (
          <li key={s.name} className="skill-card">
            <div className="skill-top">
              <b>{s.title}</b>
              {s.title !== s.name && <span className="muted small">{s.name}</span>}
              <span className="pill">{s.license}</span>
              <span className="muted small">{s.source}</span>
            </div>
            <p className="skill-desc small">{s.description || '설명 없음'}</p>
            <div className="skill-meta small">
              <span>파일 {s.files.length}{s.scripts ? ` · 스크립트 ${s.scripts}` : ''}</span>
              {s.risks.map((r) => (
                <span key={r} className="pill pill-warn" title="내용에 이런 글자가 있어요. 꼭 위험한 건 아니고, 읽어 볼 곳이에요.">
                  {RISK_LABEL[r]}
                </span>
              ))}
            </div>
            {/* 내용은 가운데 팝업(project-sections 팝업 그대로: ✕·바깥 누르면 닫힘, 열린 동안 뒤 화면 잠금) */}
            <div className="project-sections">
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
        ))}
      </ul>
    </div>
  );
}
