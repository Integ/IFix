#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

timeout_command=""
if command -v timeout >/dev/null 2>&1; then
  timeout_command="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  timeout_command="gtimeout"
fi

if [[ -n "${timeout_command}" ]]; then
  echo "Running bounded vinext build..."
  "${timeout_command}" \
    --signal=TERM \
    --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
    "${SITES_BUILD_TIMEOUT:-3m}" \
    "${vinext}" build
else
  echo "GNU timeout is unavailable; running vinext build without a time limit..."
  "${vinext}" build
fi

"${script_dir}/validate-artifact.sh"
