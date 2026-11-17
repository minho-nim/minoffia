import { useState } from 'react';
import type { KeyStatus } from '../data/store';
import { KeyStatusList } from './KeyStatusList';
import { AGENT_BY_ID, AGENTS } from '../domain/agents';
import { LEAVE_AGENTS, WORK_TYPE_LABEL, type AgentId, type Snapshot, type WorkType } from '../domain/types';

/**
 * 대신 맡을 AI가 없는 일(v0.4.44): 그 일을 할 줄 아는 AI가 모두 휴가인 업무 종류와, 계정 단위로 멈추는 일.
 * 위험 경고가 아니라 '이 일은 복귀 뒤에 해요' 안내다.
 */
export function uncovered(leave: AgentId[]): string[] {
  const out: string[] = [];
  const types: WorkType[] = ['dev', 'planning', 'research', 'design', 'prototype'];
  for (const type of types) {
    const able = AGENTS.filter((a) => a.skills.includes(type) && LEAVE_AGENTS.includes(a.id));
    if (able.length && able.every((a) => leave.includes(a.id))) out.push(`${WORK_TYPE_LABEL[type]}: ${able.map((a) => a.name).join('·')} 모두 휴가라 새 업무는 복귀 뒤에 시작해요.`);
  }
  // 웹 조사(v0.7.53): Tavily·Firecrawl 둘 다 휴가면 검색 없이, 하나만이면 남은 쪽이 대신
  if (leave.includes('search') && leave.includes('firecrawl')) out.push('웹 조사: Tavily·Firecrawl이 모두 휴가라 웹 검색을 하지 않고, Gemini가 아는 범위로만 답해요.');
  else if (leave.includes('search')) out.push('웹 조사: Tavily가 휴가라 Firecrawl이 대신 찾아요.');
  else if (leave.includes('firecrawl')) out.push('웹 조사: Firecrawl이 휴가라 본문은 읽지 않고 Tavily 요약만으로 정리해요.');
  if (leave.includes('studioA') && leave.includes('studioB')) out.push('대화 답·기획서 초안·견본·사진 분석: Studio A·B(Gemini)가 모두 휴가라 미니엉이 앱 상태 질문만 답해요.');

  return out;
}
import { spriteFor } from '../office/sprites';
import { unassignedCharacters } from '../office/unassigned';

const UNASSIGNED = unassignedCharacters();

/**
 * 팀 관리 탭(v0.4.40, 소유자 2026-11-01): 근무 칸 · 가운데 옮기기 버튼 · 휴가 칸.
 * 카드를 눌러 체크한 뒤 가운데 버튼으로 옮기거나, 카드를 끌어 반대 칸에 놓는다.
 * 화면 크기와 상관없이 늘 좌우(좁으면 카드만 작게, v0.4.41).
 * 휴가인 AI는 사무실 아래 출입문으로 나가고, 새 배정·PM 계획에서 빠져 규칙대로 다른 AI가 맡는다.
 */
export function TeamPanel({ snap, onSetLeave, loadKeys }: { snap: Snapshot; onSetLeave: (agent: AgentId, onLeave: boolean) => void; loadKeys?: () => Promise<KeyStatus[]> }) {
  const leave = snap.leave ?? [];
  const [picked, setPicked] = useState<Set<AgentId>>(() => new Set());
  const [over, setOver] = useState<'work' | 'leave' | null>(null);
  const working = LEAVE_AGENTS.filter((id) => !leave.includes(id));
  const away = LEAVE_AGENTS.filter((id) => leave.includes(id));
  const pickedWork = working.filter((id) => picked.has(id));
  const pickedAway = away.filter((id) => picked.has(id));

  const notes = uncovered(leave);
  const pickAll = (ids: AgentId[], on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const toggle = (id: AgentId) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const move = (ids: AgentId[], toLeave: boolean) => {
    ids.forEach((id) => onSetLeave(id, toLeave));
    setPicked((cur) => new Set([...cur].filter((id) => !ids.includes(id))));
  };

  const card = (id: AgentId) => {
    const a = AGENT_BY_ID[id];
    const isAway = leave.includes(id);
    const sprite = spriteFor(a, 'stand');
    const open = snap.tasks.filter((t) => t.assignee === id && t.status !== 'done').length;
    const on = picked.has(id);
    return (
      <li key={id}>
        {/* 카드 어디를 눌러도(캐릭터·이름 포함) 체크된다. 아이폰 사파리는 라벨 속 그림을 눌러도 체크가 안 될 때가 있어 직접 처리한다(v0.4.43). */}
        <div
          className={`team-card${isAway ? ' is-away' : ''}${on ? ' is-picked' : ''}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => toggle(id)}
        >
          <input type="checkbox" checked={on} onChange={() => toggle(id)} onClick={(e) => e.stopPropagation()} aria-label={`${a.name} 고르기`} />
          <img className={sprite.art ? 'is-art' : undefined} src={sprite.src} alt="" draggable={false} />
          <span className="team-name">
            <b>{a.name}</b>
            <span className="muted small">{a.role}</span>
            {isAway && open > 0 && <span className="muted small">맡을 AI가 없어 {open}건 그대로</span>}
          </span>
        </div>
      </li>
    );
  };

  const column = (kind: 'work' | 'leave', ids: AgentId[]) => (
    <section
      className={`team-col team-col-${kind}${over === kind ? ' is-over' : ''}`}
      aria-label={kind === 'work' ? '근무' : '휴가'}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(kind);
      }}
      onDragLeave={() => setOver((o) => (o === kind ? null : o))}
      onDrop={(e) => {
        e.preventDefault();
        setOver(null);
        const id = e.dataTransfer.getData('text/plain') as AgentId;
        if (!LEAVE_AGENTS.includes(id)) return;
        const toLeave = kind === 'leave';
        if (leave.includes(id) !== toLeave) move([id], toLeave);
      }}
    >
      <div className="team-col-head">
        <h3>
          {kind === 'work' ? '근무' : '휴가'} <span className="num num-count">{ids.length}</span>
        </h3>
        {ids.length > 0 && (
          <label className="team-all">
            <input
              type="checkbox"
              checked={ids.every((id) => picked.has(id))}
              onChange={(e) => pickAll(ids, e.target.checked)}
              aria-label={`${kind === 'work' ? '근무' : '휴가'} 전체 선택`}
            />
            전체
          </label>
        )}
      </div>
      {ids.length ? (
        <ul className="team-list">{ids.map(card)}</ul>
      ) : (
        <p className="team-empty muted small">{kind === 'work' ? '모두 휴가 중이에요' : '여기로 옮기면 휴가예요'}</p>
      )}
    </section>
  );

  return (
    <section className="team-panel" aria-label="팀 관리">
      <p className="muted small">
        카드를 눌러 고른 뒤 가운데 버튼으로 옮기거나, 끌어서 반대 칸에 놓으세요. 휴가인 AI의 업무는 일할 수 있는 다른 AI에게 넘어가고, 새 업무와 PM 계획에서도 빠져요(맡을 AI가 없는 업무만 그대로). 미니엉과
        미노(CI)는 늘 근무해요.
      </p>
      <div className="team-board">
        {column('work', working)}
        <div className="team-moves" role="group" aria-label="옮기기">
          <button type="button" className="btn btn-small" disabled={!pickedWork.length} onClick={() => move(pickedWork, true)} title="고른 AI를 휴가로" aria-label="고른 AI를 휴가로">
            →
          </button>
          <button type="button" className="btn btn-small" disabled={!pickedAway.length} onClick={() => move(pickedAway, false)} title="고른 AI를 근무로" aria-label="고른 AI를 근무로">
            ←
          </button>
        </div>
        {column('leave', away)}
      </div>
      {UNASSIGNED.length > 0 && (
        <section className="team-unassigned" aria-label="미배정 캐릭터">
          <h3>
            미배정 캐릭터 <span className="num num-count">{UNASSIGNED.length}</span>
          </h3>
          <ul>
            {UNASSIGNED.map((c) => (
              <li key={c.id}>
                <img className="is-art" src={c.stand} alt="미배정 캐릭터" />
              </li>
            ))}
          </ul>
        </section>
      )}
      {notes.length > 0 && (
        <div className="team-notes" role="status">
          <b>대신 맡을 AI가 없는 일</b>
          <ul>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {loadKeys && <KeyStatusList load={loadKeys} />}
    </section>
  );
}
