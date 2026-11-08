// 디자인 업무 전용 채점(v0.5.56, 소유자 목록 29번, impeccable critique 참고): 화면·디자인 업무일 때만 채점 자료 끝에
// 디자인 기준을 붙인다(호출 수는 그대로). 프로젝트 디자인 기준(DESIGN.md)이 확정돼 있으면 함께 넣는다.
// 디자인 자동 검사(impeccable) 결과는 넣지 않는다: AI 판단이 기계 결과에 끌려가지 않게 결과 카드에 따로 보여 준다.

export const DESIGN_TASK = /화면|디자인|레이아웃|스타일|모바일|휴대폰|반응형|페이지|색|글꼴|css|ui\b|홈페이지|랜딩|꾸미/i;

export const DESIGN_REVIEW_NOTE = [
  '[디자인 업무 채점 기준] 이 업무는 화면·디자인 업무다. quality·spec 점수에 아래를 반영한다.',
  '- 사용성: 지금 상태가 보이는지, 익숙한 말과 순서인지, 되돌리기 쉬운지, 같은 모양이 같은 뜻인지, 실수를 막는지, 외우지 않아도 되는지, 꼭 필요한 것만 있는지, 오류를 알아듣게 알려 주는지.',
  '- 한 화면에 동시에 고를 것이 4개를 넘으면 감점하고 fixes에 묶는 방법을 적는다.',
  '- 다른 앱에 그대로 붙여도 될 흔한 모양(장식 그라데이션·유리 효과·카드 속 카드·의미 없는 아이콘 나열)이면 감점하고 fixes에 적는다.',
  '- 프로젝트 디자인 기준이 아래에 있으면 그 밖의 색·글꼴·둥글기를 쓴 곳을 violations에 적는다.',
].join('\n');

export function designReviewSection(specText: string, designMd: string): string {
  if (!DESIGN_TASK.test(specText)) return '';
  const md = designMd.trim();
  return `\n\n${DESIGN_REVIEW_NOTE}${md ? `\n\n[프로젝트 디자인 기준(소유자 승인)]\n${md.slice(0, 4000)}` : ''}`;
}
