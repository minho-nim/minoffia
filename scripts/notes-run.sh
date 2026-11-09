#!/usr/bin/env bash
# 옵시디언 노트 보관함에 한 가지 바꾸고 올리기(v0.5.62). GitHub Actions에서만 쓴다. AI 없음.
# 사용: NOTES_REPO=owner/repo NOTES_TOKEN=… bash scripts/notes-run.sh "<커밋 메시지>" <notes-sync 명령> <프로젝트> [나머지…]
# 보관함 저장소가 아직 없거나 토큰 권한이 없으면 알림만 남기고 성공으로 끝낸다(원래 작업은 막지 않는다).
set -uo pipefail
msg="$1"; shift
cmd="$1"; shift
repo="${NOTES_REPO:-minho-nim/minoffia-notes}"
if [ -z "${NOTES_TOKEN:-}" ]; then echo "::notice::노트 보관함 토큰이 없어 옵시디언에 올리지 않았어요."; exit 0; fi
dir=$(mktemp -d)
if ! git clone -q --depth 20 "https://x-access-token:${NOTES_TOKEN}@github.com/${repo}.git" "$dir" 2>/dev/null; then
  echo "::notice::노트 보관함(${repo})을 열지 못해 옵시디언에 올리지 않았어요(저장소가 없거나 토큰 권한 없음)."; exit 0
fi
cd "$dir"
git config user.name "minoffia 노트"
git config user.email "notes@minoffia.invalid"
git rev-parse -q --verify HEAD >/dev/null || git checkout -q -b main
for try in 1 2 3 4; do
  node "$GITHUB_WORKSPACE/scripts/notes-sync.mjs" "$cmd" "$dir" "$@" || { echo "::warning::노트 만들기 실패"; exit 0; }
  git add -A
  git diff --cached --quiet && { echo "노트 바뀐 것 없음"; exit 0; }
  git commit -q -m "$msg"
  if git push -q origin HEAD 2>/dev/null; then echo "노트 올림: $msg"; exit 0; fi
  # 다른 작업이 먼저 올렸으면 받아서 다시 만든다
  sleep $((try * 3)); git fetch -q origin && git reset -q --hard "origin/$(git rev-parse --abbrev-ref HEAD)"
done
echo "::warning::노트를 올리지 못했어요(여러 번 겹침)."; exit 0
