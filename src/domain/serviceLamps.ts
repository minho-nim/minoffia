// 서버실 불빛(v0.5.57, 소유자 목록 22번 "작게"): GitHub·Cloudflare·Supabase 상태를 사무실 터미널실에 불빛 3개로 보여 준다.
// 이미 가진 기록(PR 검사·배포·Gemini 호출)만 쓴다(추가 호출·AI 없음). 확인한 것만 초록/빨강, 모르면 회색.
import type { AiCall } from './types';
import type { WorkflowData } from './workflow-types';

export type LampState = 'ok' | 'bad' | 'wait' | 'unknown';
export type Lamp = { id: 'github' | 'cloudflare' | 'supabase'; label: string; state: LampState; detail: string };

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const latest = <T,>(list: T[], at: (x: T) => string) => list.reduce<T | null>((a, b) => (!a || at(b) > at(a) ? b : a), null);

export function serviceLamps(workflow: Pick<WorkflowData, 'prChecks' | 'deployments'>, aiCalls: AiCall[], serverMode: boolean, now = Date.now()): Lamp[] {
  const pr = latest(workflow.prChecks ?? [], (p) => p.checkedAt);
  const github: Lamp = !pr
    ? { id: 'github', label: 'GitHub', state: 'unknown', detail: '확인한 PR 검사가 아직 없어요.' }
    : pr.ciState === 'success'
      ? { id: 'github', label: 'GitHub', state: 'ok', detail: `마지막 PR 검사 통과 (${when(pr.checkedAt)})` }
      : pr.ciState === 'failure'
        ? { id: 'github', label: 'GitHub', state: 'bad', detail: `마지막 PR 검사 실패 (${when(pr.checkedAt)}). 업무 카드에서 확인하세요.` }
        : pr.ciState === 'pending'
          ? { id: 'github', label: 'GitHub', state: 'wait', detail: `PR 검사 진행 중 (${when(pr.checkedAt)} 확인)` }
          : { id: 'github', label: 'GitHub', state: 'unknown', detail: `PR 검사가 없는 저장소예요 (${when(pr.checkedAt)} 확인)` };
  const dep = latest(workflow.deployments ?? [], (d) => d.createdAt);
  const cloudflare: Lamp = !dep
    ? { id: 'cloudflare', label: 'Cloudflare', state: 'unknown', detail: '앱에서 승인한 배포 기록이 아직 없어요.' }
    : dep.ok
      ? { id: 'cloudflare', label: 'Cloudflare', state: 'ok', detail: `마지막 배포 요청 성공 (${when(dep.createdAt)}). release 갱신까지 확인했고 Cloudflare 빌드 완료는 따로 확인해야 해요.` }
      : { id: 'cloudflare', label: 'Cloudflare', state: 'bad', detail: `마지막 배포 실패 (${when(dep.createdAt)}): ${dep.error.slice(0, 80)}` };
  const hourAgo = now - 3600_000;
  const serverErrors = aiCalls.filter((c) => !c.ok && (c.httpStatus ?? 0) >= 500 && new Date(c.createdAt).getTime() > hourAgo).length;
  const supabase: Lamp = !serverMode
    ? { id: 'supabase', label: 'Supabase', state: 'unknown', detail: '로컬 데모라 서버에 연결하지 않았어요.' }
    : serverErrors
      ? { id: 'supabase', label: 'Supabase', state: 'bad', detail: `지난 1시간 서버 오류 ${serverErrors}번(Gemini 호출 기준).` }
      : { id: 'supabase', label: 'Supabase', state: 'ok', detail: '연결됨. 지난 1시간 서버 오류 없음.' };
  return [github, cloudflare, supabase];
}
