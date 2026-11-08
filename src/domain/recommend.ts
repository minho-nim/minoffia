// 확인 질문의 추천 답(v0.5.37, mattpocock grilling에서 착안): AI가 질문마다 "→ 추천: …"을 붙이면
// '추천대로 채우기'로 답칸을 한 번에 채운다(사용자는 고치거나 그대로 보낸다). 규칙만, 토큰 0.
export function recommendedReply(questions: string | string[]): string | null {
  const lines = Array.isArray(questions) ? questions : questions.split('\n');
  const picks = lines
    .map((l) => l.match(/추천\s*[:：]\s*(.+?)\s*$/)?.[1]?.trim())
    .filter((x): x is string => Boolean(x));
  return picks.length ? picks.map((p, i) => `${i + 1}. ${p}`).join('\n') : null;
}
