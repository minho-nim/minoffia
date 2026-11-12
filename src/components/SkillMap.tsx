// 스킬 그림 지도(v0.6.62, 소유자 "floor map처럼 스킬 지도, 미리 만들자"): 방 = 분류, 그 안에 스킬 카드(쓰임·들어간 곳·기본),
// 아래 표 = 프로젝트마다 어떤 스킬이 들어 있는지. 규칙만(AI 없음). 프로젝트 상태는 '지도'를 열 때 한 번 읽는다(저장소당 GitHub 1번).
import { useEffect, useState } from 'react';
import { installedCount, SKILL_CATEGORIES, type SkillMapData, type SkillMapState, type SkillView } from '../domain/skills';
import type { SkillProject } from './SkillsPanel';

const MARK: Record<SkillMapState | 'none', { sym: string; label: string }> = {
  same: { sym: '●', label: '들어 있음' },
  old: { sym: '◐', label: '옛 버전' },
  extra: { sym: '◇', label: '모음에 없는 스킬(직접 넣음)' },
  none: { sym: '·', label: '없음' },
};

export function SkillMap({ skills, usage, projects, load, onPick }: {
  skills: SkillView[];
  usage: Map<string, number>;
  projects: SkillProject[];
  load?: () => Promise<SkillMapData>;
  /** 스킬 카드를 누르면(넣기 창 열기) */
  onPick?: (name: string) => void;
}) {
  const [map, setMap] = useState<SkillMapData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!load) {
      setMap({});
      return;
    }
    load().then(setMap, (e) => {
      setError((e as Error).message || '프로젝트 상태를 읽지 못했어요.');
      setMap({});
    });
  }, []);
  const rooms = SKILL_CATEGORIES.map((c) => [c, skills.filter((s) => s.category === c)] as const).filter(([, list]) => list.length > 0);
  // 표 칸: 모음의 스킬(도구 제외) + 프로젝트에만 있는 스킬
  const names = [...new Set([...skills.filter((s) => !s.meta).map((s) => s.name), ...Object.values(map ?? {}).flatMap((m) => Object.keys(m))])];
  const title = (n: string) => skills.find((s) => s.name === n)?.title ?? n;

  return (
    <div className="skill-floor">
      <div className="skill-rooms">
        {rooms.map(([c, list]) => (
          <section key={c} className={`skill-room room-${c === '도구' ? 'tools' : 'normal'}`} aria-label={`${c} 방`}>
            <h4>
              {c} <span className="num num-count">{list.length}</span>
            </h4>
            <div className="skill-tiles">
              {list.map((s) => (
                <button key={s.name} type="button" className="skill-tile" disabled={s.meta || !onPick} onClick={() => onPick?.(s.name)} title={s.description}>
                  <b>
                    {s.title}
                    {s.isDefault && <span className="tile-star" aria-label="기본 스킬"> ★</span>}
                    {s.risks.length > 0 && <span className="tile-warn" aria-label="위험 표시 있음"> ⚠</span>}
                  </b>
                  <span className="tile-meta">
                    {s.meta ? '미노피아 전용 도구' : `쓰임 ${usage.get(s.name) ?? 0} · ${map ? `${installedCount(map, s.name)}곳` : '…'}`}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="skill-proj">
        <h4>프로젝트별</h4>
        {error && <p className="task-error small">{error}</p>}
        {map === null ? (
          <p className="muted small">프로젝트마다 들어 있는 스킬을 읽는 중…</p>
        ) : projects.length === 0 ? (
          <p className="muted small">저장소가 연결된 프로젝트가 없어요.</p>
        ) : names.length === 0 ? (
          <p className="muted small">아직 프로젝트에 넣은 스킬이 없어요. 스킬 카드를 눌러 넣을 수 있어요.</p>
        ) : (
          <div className="tbl-scroll">
            <table className="skill-matrix">
              <thead>
                <tr>
                  <th>프로젝트</th>
                  {names.map((n) => (
                    <th key={n} title={n}>
                      {title(n)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}</th>
                    {names.map((n) => {
                      const st: SkillMapState | 'none' = map[p.id]?.[n] ?? 'none';
                      return (
                        <td key={n} className={`mark-${st}`} title={`${p.name} · ${title(n)}: ${MARK[st].label}`}>
                          {MARK[st].sym}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small skill-legend">
          {(['same', 'old', 'extra', 'none'] as const).map((k) => (
            <span key={k}>
              {MARK[k].sym} {MARK[k].label}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
