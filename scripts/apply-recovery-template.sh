#!/bin/bash
# Switch the Supabase "Reset password" e-mail to the token_hash link (works on any device, scanner-safe).
# Usage: scripts/apply-recovery-template.sh apply|revert
# apply  -> uploads supabase/auth-templates/recovery.html
# revert -> restores the template saved in ~/Projects/bewerbungen-tracker-backups/20261115-reset-fix/auth-config-before.json
# Deploy the app code that understands ?token_hash= (app/login/reset) to production BEFORE running "apply".
set -euo pipefail
REF=bhwreehwirrloxagyypi
DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP="$HOME/Projects/bewerbungen-tracker-backups/20261115-reset-fix/auth-config-before.json"
T="$(grep -E '^SUPABASE_TOKEN_PRIVAT=' "$HOME/.config/alfred/supabase.env" | tail -n1 | cut -d= -f2- | tr -d '[:space:]"'"'")"
case "${1:-}" in
  apply)  body="$(python3 -c 'import json,sys;print(json.dumps({"mailer_templates_recovery_content":open(sys.argv[1]).read()}))' "$DIR/supabase/auth-templates/recovery.html")" ;;
  revert) body="$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(json.dumps({"mailer_templates_recovery_content":d["mailer_templates_recovery_content"]}))' "$BACKUP")" ;;
  *) echo "Usage: $0 apply|revert" >&2; exit 2 ;;
esac
curl -sf -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$REF/config/auth" -d "$body" \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);t=d["mailer_templates_recovery_content"];print("recovery template now uses", "token_hash link" if "token_hash=" in t else "ConfirmationURL (old)")'
