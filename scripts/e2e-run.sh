#!/usr/bin/env bash
# Convenience runner for the OSS Playwright E2E/regression suite.
#
# Credentials are NEVER committed. Per the e2e convention they are EXPORTED in
# the shell before running (see apps/web/e2e/README.md). This script also
# sources a local, git-ignored .env if present, so you can keep TEST_USER_*
# there locally.
#
#   export E2E_BASE_URL=https://dev.evaluchat.org
#   export TEST_USER_EMAIL=... TEST_USER_PASSWORD=...
#   ./scripts/e2e-run.sh npx playwright test --grep @regression --reporter=list
set -euo pipefail
cd "$(dirname "$0")/.."

# Load git-ignored local env (optional) but never override an explicit shell var.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

export E2E_BASE_URL="${E2E_BASE_URL:-https://dev.evaluchat.org}"

if [ -z "${TEST_USER_EMAIL:-}" ] || [ -z "${TEST_USER_PASSWORD:-}" ]; then
  echo "Missing TEST_USER_EMAIL / TEST_USER_PASSWORD (export them, or add to git-ignored .env)." >&2
  exit 2
fi

exec "$@"
