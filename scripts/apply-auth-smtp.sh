#!/bin/bash
# Configure Supabase Auth custom SMTP + German templates (project bhwreehwirrloxagyypi).
# Reads secrets from ~/.config/alfred/{supabase,smtp}.env, never prints them.
# smtp.env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_ADMIN_EMAIL (verified sender)
set -euo pipefail
set -a; . ~/.config/alfred/smtp.env; set +a
TOKEN=$(grep -E "^SUPABASE_TOKEN_PRIVAT=" ~/.config/alfred/supabase.env | cut -d= -f2- | tr -d '[:space:]"'"'")
python3 - <<'PY' > /tmp/auth-smtp-body.json
import json,os
d="supabase/email-templates/"
subj={"confirmation":"Bestätige deine E-Mail-Adresse für WendApply","recovery":"Passwort bei WendApply zurücksetzen","invite":"Einladung zu WendApply","magic_link":"Dein Anmelde-Link für WendApply"}
b={"smtp_host":os.environ["SMTP_HOST"],"smtp_port":os.environ["SMTP_PORT"],"smtp_user":os.environ["SMTP_USER"],
   "smtp_pass":os.environ["SMTP_PASS"],"smtp_admin_email":os.environ["SMTP_ADMIN_EMAIL"],"smtp_sender_name":"WendApply",
   "rate_limit_email_sent":30,"smtp_max_frequency":30}
for k,s in subj.items():
    b[f"mailer_subjects_{k}"]=s
    b[f"mailer_templates_{k}_content"]=open(d+k+".html").read()
print(json.dumps(b))
PY
curl -sS -o /dev/null -w "HTTP %{http_code}\n" -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d @/tmp/auth-smtp-body.json https://api.supabase.com/v1/projects/bhwreehwirrloxagyypi/config/auth
rm -f /tmp/auth-smtp-body.json
