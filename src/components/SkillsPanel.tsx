// 스킬 탭(v0.6.55, 소유자 "설정 탭 왼쪽에 skills 탭, 내용과 설명을 보게"): 이 저장소 .claude/skills의 스킬을 목록으로,
// 누르면 가운데 팝업으로 내용을 본다(프로젝트 칸과 같은 팝업, 바깥 누르면 닫힘). 읽기는 GitHub만, AI 호출 없음.
// 만들기·찾기는 대화창에 스킬 업무 요청 글을 채워 주고, 결과는 늘 PR(올리기 승인)로 들어온다.
import { useEffect, useMemo, useState } from 'react';
import { RISK_LABEL, toSkillView, type SkillFile } from '../domain/skills';

export function SkillsPanel({ load, onRequest, canRequest }: { load: () => Promise<SkillFile[]>; onRequest: (kind: 'make' | 'find') => void; canRequest: boolean }) {
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
          <button type="button" className="btn btn-small btn-primary" disabled={!canRequest} onClick={() => onRequest('make')}>
            만들기
          </button>
          <button type="button" className="btn btn-small btn-ghost" disabled={!canRequest} onClick={() => onRequest('find')}>
            찾기
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={refresh} aria-label="스킬 목록 다시 읽기">
            새로 읽기
          </button>
        </span>
      </div>
      <p className="muted small">
        Claude가 이 저장소에서 일할 때 쓰는 작업 설명서예요. 만들기·찾기를 누르면 대화창에 요청 글이 채워지고, Claude가 만든 스킬은 올리기 승인 뒤 PR로 들어와요.
      </p>
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
