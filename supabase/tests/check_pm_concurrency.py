"""scripts/test-db.sh가 만든 로컬 시험 DB에서 두 연결의 예약 경쟁을 확인한다."""
from concurrent.futures import ThreadPoolExecutor
import subprocess
from uuid import uuid4


def sql(text):
    return subprocess.run(
        ['psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', 'minlab_test'],
        input=text, text=True, capture_output=True, check=True,
    ).stdout.strip()


def fixture():
    owner, project, t1, t2 = [str(uuid4()) for _ in range(4)]
    sql(f"""
        insert into auth.users(id,email) values ('{owner}','race@example.invalid');
        select set_config('request.jwt.claims','{{"sub":"{owner}","role":"authenticated","email":"race@example.invalid"}}',false);
        set role authenticated;
        insert into projects(id,name,repo) values ('{project}','Race','owner/race');
        insert into tasks(id,project_id,title,type,assignee) values
          ('{t1}','{project}','Race 1','dev','codex'), ('{t2}','{project}','Race 2','dev','codex');
        insert into task_specs(task_id,revision,intent,user_original_text,final_prompt) values
          ('{t1}',1,'change_request','test','test'), ('{t2}',1,'change_request','test','test');
        insert into approvals(task_id,gate,decision,approved_revision) values
          ('{t1}','A','approved',1), ('{t2}','A','approved',1);
    """)
    return owner, t1, t2


def race(owner, tasks, cap):
    def claim(task):
        return sql(f"""
          begin;
          set local role service_role;
          select state || ':' || reason from claim_gemini_pm('{task}','{owner}',1,{cap},'test');
          select pg_sleep(0.2);
          commit;
        """).strip()
    with ThreadPoolExecutor(max_workers=2) as executor:
        return sorted(executor.map(claim, tasks))


owner, t1, _ = fixture()
assert race(owner, [t1, t1], 20) == ['busy:in_progress', 'claimed:']
assert sql(f"select count(*) from ai_calls where owner_id='{owner}'") == '1'
owner, t1, t2 = fixture()
assert race(owner, [t1, t2], 1) == ['claimed:', 'rejected:daily_cap']
assert sql(f"select count(*) from ai_calls where owner_id='{owner}'") == '1'
print('Gemini PM: same-request and daily-cap races passed (two DB connections)')
