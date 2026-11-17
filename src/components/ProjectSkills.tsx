// 프로젝트 칸의 '스킬'(v0.6.66, 소유자 "미노피아에서도 프로젝트랑 연결"): 이 프로젝트 저장소에 들어 있는 스킬과 상태,
// 그리고 스킬 모음에는 있지만 아직 안 넣은 스킬. 넣기·빼기는 스킬 탭의 넣기 창으로 간다. 읽기는 GitHub만(AI 없음),
// 스킬 지도와 같은 자료를 한 번 읽어 모든 프로젝트가 나눠 쓴다(App이 저장해 둔다).
import { useEffect, useState } from 'react';
import { toSkillView, type SkillFile, type SkillMapData, type SkillMapState } from '../domain/skills';

const STATE: Record<SkillMapState, { mark: string; label: string }> = {
  same: { mark: '●', label: '들어 있음' },
  old: { mark: '◐', label: '옛 버전' },
  extra: { mark: '◇', label: '이 프로젝트에만 있음' },
};

export function ProjectSkills({ projectId, load, onManage, ver = 0 }: {
  projectId: string;
  /** 스킬 모음 목록과 프로젝트별 상태(한 번 읽어 나눠 씀) */
  load: () => Promise<{ files: SkillFile[]; map: SkillMapData }>;
  /** 스킬 탭에서 이 스킬 넣기 창 열기(이름이 없으면 스킬 탭만) */
  onManage: (skill?: string) => void;
  /** 스킬 자료를 새로 읽으면 바뀜: 다시 그린다(v0.7.47) */
  ver?: number;
}) {
  const [data, setData] = useState<{ files: SkillFile[]; map: SkillMapData } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    load().then(setData, (e) => setError((e as Error).message || '스킬을 읽지 못했어요.'));
  }, [ver]);
  if (error) return <p className="task-error small">{error}</p>;
  if (!data) return <p className="muted small">이 프로젝트의 스킬을 읽는 중…</p>;
  const views = data.files.map(toSkillView);
  const title = (n: string) => views.find((v) => v.name === n)?.title ?? n;
  const mine = data.map[projectId] ?? {};
  const inside = Object.entries(mine);
  const notYet = views.filter((v) => !v.meta && !mine[v.name]);
  return (
    <div className="project-skills">
      <p className="muted small">이 프로젝트 저장소(.agents/skills·.claude/skills)에 들어 있는 스킬이에요. 여기서 일하는 AI(Claude·Codex)가 필요할 때 꺼내 써요.</p>
      {inside.length === 0 ? (
        <p className="small">아직 들어 있는 스킬이 없어요.</p>
      ) : (
        <ul className="pskill-list">
          {inside.map(([n, st]) => (
            <li key={n}>
              <span className={`pskill-mark mark-${st}`} aria-hidden="true">
                {STATE[st].mark}
              </span>
              <span className="pskill-name">{title(n)}</span>
              <span className="muted small">{STATE[st].label}</span>
              {st === 'old' && (
                <button type="button" className="link-btn small" onClick={() => onManage(n)}>
                  갱신
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {notYet.length > 0 && (
        <>
          <p className="small pskill-sub">넣을 수 있는 스킬</p>
          <div className="pskill-add">
            {notYet.map((v) => (
              <button key={v.name} type="button" className="chip" onClick={() => onManage(v.name)} title={v.description}>
                + {v.title}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" className="btn btn-small btn-ghost" onClick={() => onManage()}>
        스킬 탭에서 보기
      </button>
    </div>
  );
}
