#!/bin/bash
# Uploads dist/_worker.js as a new production deployment of the Cloudflare Pages project.
# The project's KV binding (RSVP) and secret (ADMIN_KEY) live in the Pages project settings, not here.
# Needs: CLOUDFLARE_API_TOKEN (Pages edit) and CLOUDFLARE_ACCOUNT_ID in the environment.
set -euo pipefail
cd "$(dirname "$0")"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
PROJECT="${PAGES_PROJECT:-allinq-christmas-party}"
# main = production; any other branch = preview at https://<branch>.<project>.pages.dev (separate preview KV).
BRANCH="${DEPLOY_BRANCH:-main}"
[ -f dist/_worker.js ] || bash build.sh
resp=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "manifest={}" -F "branch=$BRANCH" -F "_worker.js=@dist/_worker.js;type=application/javascript")
# Print Cloudflare's own error (missing permission, wrong account, expired token) instead of a bare HTTP code.
printf '%s' "$resp" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print('Cloudflare returned a non-JSON response'); sys.exit(1)
if d.get('success'):
    print('deployed:', True, d['result'].get('url'), d['result'].get('environment'))
else:
    print('deploy failed:', [f\"{e.get('code')}: {e.get('message')}\" for e in d.get('errors', [])])
    sys.exit(1)
"
