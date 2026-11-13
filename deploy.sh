#!/bin/bash
# Uploads dist/_worker.js as a new production deployment of the Cloudflare Pages project.
# The project's KV binding (RSVP) and secret (ADMIN_KEY) live in the Pages project settings, not here.
# Needs: CLOUDFLARE_API_TOKEN (Pages edit) and CLOUDFLARE_ACCOUNT_ID in the environment.
set -euo pipefail
cd "$(dirname "$0")"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
PROJECT="${PAGES_PROJECT:-allinq-christmas-party}"
[ -f dist/_worker.js ] || bash build.sh
curl -fsS -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/deployments" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "manifest={}" -F "branch=main" -F "_worker.js=@dist/_worker.js;type=application/javascript" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('deployed:',d['success'],(d.get('result') or {}).get('url'),d.get('errors'))"
