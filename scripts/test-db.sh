#!/usr/bin/env bash
# 로컬 Postgres(기본 127.0.0.1:54329)에 빈 DB를 만들고 마이그레이션과 승인 규칙 테스트를 돌린다.
set -euo pipefail
PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-54329} PGUSER=${PGUSER:-postgres}
export PGHOST PGPORT PGUSER
DB=minlab_test
psql -q -c "drop database if exists $DB" -c "create database $DB"
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do run "$f"; done
run supabase/tests/99_grants.sql
run supabase/tests/10_workflow_gates.sql
run supabase/tests/30_attachments.sql
run supabase/tests/40_links_clarifications.sql
run supabase/tests/50_ai_calls.sql
run supabase/tests/60_managed_repos.sql
run supabase/tests/70_image_analyses.sql
run supabase/tests/80_concurrency.sql
run supabase/tests/90_pr_checks.sql
run supabase/tests/95_inbox_deployments.sql
run supabase/tests/96_document_attachments.sql
run supabase/tests/97_prototype_first.sql
run supabase/tests/98_realtime.sql
run supabase/tests/99_claude_dev.sql
run supabase/tests/99_predev_chat.sql
run supabase/tests/99_pm_any_assignee.sql
run supabase/tests/99_gemini_draft.sql
run supabase/tests/99_pm_plan_inbox.sql
run supabase/tests/99_dev_result_inbox.sql
run supabase/tests/99_auto_pr_merge.sql
run supabase/tests/99_push.sql
run supabase/tests/99_b_waits.sql
run supabase/tests/99_agent_leave.sql
run supabase/tests/99_project_rules.sql

# 기존 v0.1 데이터가 0003 적용 후에도 남는지
psql -q -c "drop database if exists ${DB}_mig" -c "create database ${DB}_mig"
runm() { psql -q -v ON_ERROR_STOP=1 -d "${DB}_mig" -f "$1"; }
runm supabase/tests/00_supabase_shim.sql
runm supabase/migrations/0001_office.sql
runm supabase/migrations/0002_revoke_tasks_guard.sql
runm supabase/tests/20_migration_preserves_v01.sql
runm supabase/migrations/0003_v021_approval_gates.sql
runm supabase/migrations/0004_attachments.sql
runm supabase/migrations/0005_links_clarifications.sql
runm supabase/migrations/0006_ai_calls.sql
runm supabase/migrations/0007_managed_repos.sql
runm supabase/migrations/0008_image_analyses.sql
runm supabase/migrations/0009_concurrency_limit.sql
runm supabase/migrations/0010_pr_checks.sql
runm supabase/migrations/0011_inbox_deployments.sql
runm supabase/migrations/0012_document_attachments.sql
runm supabase/migrations/0013_html_svg_attachments.sql
runm supabase/migrations/0014_prototype_first.sql
runm supabase/migrations/0015_realtime.sql
runm supabase/migrations/0016_claude_support_dev.sql
runm supabase/migrations/0017_predev_task_chat.sql
runm supabase/migrations/0018_pm_any_assignee.sql
runm supabase/migrations/0019_gemini_spec_draft.sql
runm supabase/migrations/0020_pm_plan_inbox.sql
runm supabase/migrations/0021_dev_result_inbox.sql
runm supabase/migrations/0022_auto_pr_merge.sql
runm supabase/migrations/0023_prototype_ai_calls.sql
runm supabase/migrations/0024_push_notifications.sql
runm supabase/migrations/0025_b_waits_all_work.sql
runm supabase/migrations/0026_agent_leave.sql
runm supabase/migrations/0027_preview_and_project_rules.sql
runm supabase/tests/21_migration_check.sql
echo "DB 테스트 통과"
