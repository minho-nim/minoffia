// '구조 보기'(v0.6.70 소유자 "지도는 구조 보기 하나로 모으고, 프로젝트와 스킬 탭이 같은 모양으로"):
// 간략 지도(쉬운 카드) · 자세히(floorplan) · 구조도(폴더 나무)를 한 팝업의 탭으로. 점검(다시 점검)은 따로 둔다.
// 읽기는 탭을 처음 열 때 한 번씩만(점검 결과·지도 HTML·파일 목록). AI 호출 없음.
import { useEffect, useState, type ReactNode } from 'react';
import { AppMapView, type HealthApi } from './HealthCheck';
import type { HealthReport } from '../domain/healthText';

export type MapTab = 'brief' | 'detail' | 'relation' | 'tree';
const NAME: Record<MapTab, string> = { brief: '간략', detail: '자세히', relation: '관계', tree: '구조도' };
// 마지막에 본 탭(팝업을 다시 열면 그 탭으로, 앱을 켜 있는 동안만)
const lastTab: Record<string, MapTab> = {};

export function StructureMaps({ id, health, structure, relation }: {
  /** 마지막 탭을 기억할 이름(프로젝트 id 등) */
  id: string;
  health?: Pick<HealthApi, 'load' | 'map'>;
  structure?: () => ReactNode;
  relation?: () => ReactNode;
}) {
  const tabs = ([health && 'brief', health && 'detail', relation && 'relation', structure && 'tree'].filter(Boolean) as MapTab[]);
  const [tab, setTabState] = useState<MapTab>(() => (lastTab[id] && tabs.includes(lastTab[id]) ? lastTab[id] : tabs[0]));
  const setTab = (t: MapTab) => {
    lastTab[id] = t;
    setTabState(t);
  };
  const [report, setReport] = useState<HealthReport | null | undefined>(undefined);
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!health) return;
    if (tab === 'brief' && report === undefined) health.load().then(setReport, () => setReport(null));
    if (tab === 'detail' && html === undefined)
      health.map().then(
        (h) => setHtml(h ?? null),
        (e) => {
          setHtml(null);
          setMsg((e as Error).message || '지도를 열지 못했어요.');
        },
      );
  }, [tab]);
  if (!tabs.length) return <p className="muted small">볼 수 있는 지도가 없어요.</p>;

  return (
    <div className={`maps-pop maps-${tab}`}>
      <div className="maps-tabs" role="tablist" aria-label="지도 종류">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" className="maps-tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {NAME[t]}
          </button>
        ))}
      </div>
      <div className="maps-body" role="tabpanel" aria-label={NAME[tab]}>
        {tab === 'brief' &&
          (report === undefined ? (
            <p className="muted small">간략 지도를 불러오는 중…</p>
          ) : report?.appMap ? (
            <AppMapView map={report.appMap} />
          ) : (
            <p className="muted small">{report?.files === 0 ? '코드 파일이 없는 저장소라 지도를 만들 수 없어요.' : "간략 지도는 점검 때 만들어져요. '점검'에서 '점검하기'를 눌러 주세요."}</p>
          ))}
        {tab === 'detail' &&
          (html ? (
            <iframe className="archify-frame maps-frame" sandbox="allow-scripts" srcDoc={html} title="자세한 지도(floorplan)" />
          ) : (
            <p className="muted small">{html === undefined ? '자세한 지도를 불러오는 중…' : msg || "자세한 지도가 아직 없어요. '점검'에서 점검을 먼저 해 주세요."}</p>
          ))}
        {tab === 'relation' && relation?.()}
        {tab === 'tree' && structure?.()}
      </div>
    </div>
  );
}
