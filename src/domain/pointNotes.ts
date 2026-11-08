// 화면 짚어서 수정 요청(v0.5.48, 소유자 요청 13번): 결과 스크린샷을 눌러 번호 표시를 찍고 고칠 점을 적으면,
// 위치를 말로 바꿔(규칙, 모델 호출 없음) 수정 요청 글에 넣는다.
export type Pin = { x: number; y: number; note: string };

/** 가로·세로 비율(0~100)을 "위쪽 왼쪽"처럼 말로 */
export function whereText(x: number, y: number): string {
  const row = y < 34 ? '위쪽' : y < 67 ? '가운데' : '아래쪽';
  const col = x < 34 ? '왼쪽' : x < 67 ? '가운데' : '오른쪽';
  return row === '가운데' && col === '가운데' ? '한가운데' : `${row} ${col}`;
}

/** 수정 요청에 넣을 글. 설명이 빈 표시는 뺀다 */
export function pointNotesText(name: string, pins: Pin[]): string {
  const lines = pins
    .filter((p) => p.note.trim())
    .map((p, i) => `${i + 1}) ${whereText(p.x, p.y)}(가로 ${Math.round(p.x)}%·세로 ${Math.round(p.y)}%): ${p.note.trim()}`);
  return lines.length ? `[화면 짚기] 결과 스크린샷 '${name}'\n${lines.join('\n')}` : '';
}
