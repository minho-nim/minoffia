// 날씨 답 표(v0.7.70, 소유자 "시안 두 개 섞어"): 위는 오늘·내일·모레 칸 3개(시안 A), 아래는 남은 날 표 + 기온 막대(시안 B).
// 막대는 이번 주 가장 낮은 최저부터 가장 높은 최고까지 한 눈금. 비·눈 50% 이상은 ☂.
import type { WeatherData } from '../domain/weather';

const WET = 50;
const LABEL = ['오늘', '내일', '모레'];

export function WeatherCard({ data }: { data: WeatherData }) {
  const top = data.days.slice(0, 3);
  const rest = data.days.slice(3);
  const min = Math.min(...data.days.map((d) => d.lo));
  const max = Math.max(...data.days.map((d) => d.hi));
  const span = Math.max(1, max - min);
  const wetSoon = top.some((d) => (d.rain ?? 0) >= WET);
  return (
    <div className="wx" aria-label={`${data.place} 날씨`}>
      <div className="wx-head">
        <b>{data.place} 날씨</b>
        {data.now && (
          <span className="wx-now">
            지금 <span className="wx-num">{data.now.temp}°</span> {data.now.sky}
          </span>
        )}
      </div>
      <div className="wx-days">
        {top.map((d, i) => {
          const wet = (d.rain ?? 0) >= WET;
          return (
            <div key={d.date} className={`wx-day${i === 0 ? ' is-today' : ''}`}>
              <b>
                {LABEL[i]} {d.wd}
              </b>
              <span>
                {d.sky}
                {wet ? ' ☂' : ''}
              </span>
              <span className="wx-num">
                <span className="wx-lo">{d.lo}°</span> / <span className="wx-hi">{d.hi}°</span>
              </span>
              {d.rain !== null && <span className={`wx-rain${wet ? ' is-wet' : ''}`}>비·눈 {d.rain}%</span>}
            </div>
          );
        })}
      </div>
      {wetSoon && <p className="wx-tip">☂ 표시 날은 우산을 챙기세요.</p>}
      {rest.length > 0 && (
        <div className="wx-table-wrap">
          <table className="wx-table">
            <caption>이번 주 남은 날</caption>
            <thead>
              <tr>
                <th scope="col">날</th>
                <th scope="col">날씨</th>
                <th scope="col">기온</th>
                <th scope="col">
                  <span className="sr-only">기온 막대</span>
                </th>
                <th scope="col" className="wx-r">
                  비·눈
                </th>
              </tr>
            </thead>
            <tbody>
              {rest.map((d) => {
                const wet = (d.rain ?? 0) >= WET;
                return (
                  <tr key={d.date} className={wet ? 'is-wet' : undefined}>
                    <td>
                      {d.date.slice(5).replace('-', '/')} {d.wd}
                    </td>
                    <td>
                      {d.sky}
                      {wet ? ' ☂' : ''}
                    </td>
                    <td className="wx-num">
                      <span className="wx-lo">{d.lo}°</span>/<span className="wx-hi">{d.hi}°</span>
                    </td>
                    <td aria-hidden="true">
                      <span className="wx-bar">
                        <span style={{ left: `${((d.lo - min) / span) * 100}%`, width: `${Math.max(4, ((d.hi - d.lo) / span) * 100)}%` }} />
                      </span>
                    </td>
                    <td className="wx-r wx-num wx-rain-cell">{d.rain === null ? '-' : `${d.rain}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
