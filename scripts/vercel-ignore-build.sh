#!/bin/sh
# Vercel "Ignored Build Step" (apps/web/vercel.json, ignoreCommand).
# Exit 0 skips the build; any other exit code builds.
#
# Skips a deployment when every file changed since the last deployed commit is
# under etl/: the Python data pipeline, which the site never reads (it reads
# what the pipeline writes to data/build/, and a change there still builds).
# When in doubt it builds: no previous commit, a commit missing from Vercel's
# shallow clone, or an empty diff (a manual redeploy).
cd "$(git rev-parse --show-toplevel)" || exit 1
base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
changed=$(git diff --name-only "$base" HEAD 2>/dev/null) || exit 1
[ -n "$changed" ] || exit 1
if printf '%s\n' "$changed" | grep -qv '^etl/'; then
  exit 1
fi
echo "Only etl/ changed since $base: skipping the build."
exit 0
