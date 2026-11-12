// 프로젝트별 스킬(v0.6.62 그림 지도에서 v0.6.70 소유자 "앱 지도와 똑같이"로 지도는 앱 점검(간략·자세한 지도)이 맡고,
// 여기는 프로젝트마다 어떤 스킬이 들어 있는지만: 넓은 화면은 표, 휴대폰은 프로젝트마다 한 줄. 규칙만(AI 없음). 프로젝트 상태는 '지도'를 열 때 한 번 읽는다(저장소당 GitHub 1번).
import { useEffect, useState } from 'react';
import { type SkillMapData, type SkillMapState, type SkillView } from '../domain/skills';
import type { SkillProject } from './SkillsPanel';

const MARK: Record<SkillMapState | 'none', { sym: string; label: string }> = {
  same: { sym: '●', label: '들어 있음' },
  old: { sym: '◐', label: '옛 버전' },
  extra: { sym: '◇', label: '모음에 없는 스킬(직접 넣음)' },
  none: { sym: '·', label: '없음' },
};

export function SkillMap({ skills, projects, load }: {
  skills: SkillView[];
  projects: SkillProject[];
  load?: () => Promise<SkillMapData>;
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
  // 표 칸: 모음의 스킬(도구 제외) + 프로젝트에만 있는 스킬
  const names = [...new Set([...skills.filter((s) => !s.meta).map((s) => s.name), ...Object.values(map ?? {}).flatMap((m) => Object.keys(m))])];
  const title = (n: string) => skills.find((s) => s.name === n)?.title ?? n;

  return (
    <div className="skill-floor">
      <div className="skill-proj">
        {error && <p className="task-error small">{error}</p>}
        {map === null ? (
          <p className="muted small">프로젝트마다 들어 있는 스킬을 읽는 중…</p>
        ) : projects.length === 0 ? (
          <p className="muted small">저장소가 연결된 프로젝트가 없어요.</p>
        ) : names.length === 0 ? (
          <p className="muted small">아직 프로젝트에 넣은 스킬이 없어요. 스킬 카드를 눌러 넣을 수 있어요.</p>
        ) : (
          <>
          {/* 휴대폰(v0.6.67 소유자 "모바일에서 스킬 지도 보기가 어색"): 넓은 표 대신 프로젝트마다 한 줄(개수), 누르면 그 프로젝트 스킬 */}
          <ul className="skill-proj-cards">
            {projects.map((p) => {
              const m = map[p.id] ?? {};
              const list = Object.entries(m);
              const n = (k: SkillMapState) => list.filter(([, v]) => v === k).length;
              return (
                <li key={p.id}>
                  <details>
                    <summary>
                      <span className="spc-name">{p.name}</span>
                      <span className="spc-count">
                        {list.length === 0 ? (
                          <span className="mark-none">없음</span>
                        ) : (
                          <>
                            {n('same') > 0 && <span className="mark-same">● {n('same')}</span>}
                            {n('old') > 0 && <span className="mark-old">◐ {n('old')}</span>}
                            {n('extra') > 0 && <span className="mark-extra">◇ {n('extra')}</span>}
                          </>
                        )}
                      </span>
                    </summary>
                    <div className="spc-list">
                      {list.length === 0 ? (
                        <span className="muted small">들어 있는 스킬이 없어요.</span>
                      ) : (
                        list.map(([sk, st]) => (
                          <span key={sk} className={`spc-chip mark-${st}`}>
                            {MARK[st].sym} {title(sk)}
                          </span>
                        ))
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          <div className="tbl-scroll skill-matrix-wrap">
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
          </>
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
