# E-Mail-Versand (Supabase Auth)

Status (2026-11-06): Supabase nutzt noch den **Standard-Mailer** (`rate_limit_email_sent = 2`/Stunde, keine eigenen Templates). Custom SMTP ist **nicht eingerichtet**, weil die Konto-Erstellung bei Resend (hCaptcha) und Brevo (reCAPTCHA) ein CAPTCHA verlangt.

## Was zu tun ist (ca. 15 Minuten)
1. **Brevo** (Free, 300 Mails/Tag, beliebige Empfänger ohne eigene Domain über einen verifizierten Einzel-Absender): Konto anlegen → Senders, Domains & Dedicated IPs → Senders → Absender-Adresse hinzufügen und per Mail bestätigen → SMTP & API → SMTP-Key erzeugen.
   - Host `smtp-relay.brevo.com`, Port `587`, User = SMTP-Login (unter SMTP & API), Pass = SMTP-Key.
2. `~/.config/alfred/smtp.env` (chmod 600) mit `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` (= verifizierter Absender).
3. `scripts/apply-auth-smtp.sh` ausführen: setzt SMTP, Absendername "WendApply", `rate_limit_email_sent=30` und die deutschen Templates aus `supabase/email-templates/` (confirmation, recovery, invite, magic_link). Ohne Custom SMTP lehnt die Management API Templates ab (HTTP 400).
4. Test: Registrierung mit einer eigenen Plus-Adresse, Mail prüfen, Testnutzer danach löschen.

Resend Free sendet ohne verifizierte Domain nur an den Kontoinhaber (`onboarding@resend.dev`), taugt also erst nach dem DNS-Schritt.

## DNS für wendapply.ch (nicht verändert)
Exakte Werte zeigt der Anbieter beim Hinzufügen der Domain; Struktur (mit `<…>` = aus dem Dashboard kopieren, nicht verifiziert):

**Brevo**
| Typ | Name | Wert |
|---|---|---|
| TXT | `@` | `brevo-code:<Code aus Brevo>` |
| CNAME | `brevo1._domainkey` | `b1.wendapply-ch.dkim.brevo.com` |
| CNAME | `brevo2._domainkey` | `b2.wendapply-ch.dkim.brevo.com` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<Postfach>` |
| TXT | `@` (SPF, falls keiner existiert) | `v=spf1 include:spf.brevo.com ~all` |

**Resend** (Subdomain `send.wendapply.ch`)
| Typ | Name | Wert |
|---|---|---|
| MX | `send` | `feedback-smtp.<region>.amazonses.com`, Prio 10 (Return-Path) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | `p=<DKIM-Schlüssel aus Resend>` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<Postfach>` |

Danach Absender auf `noreply@wendapply.ch` umstellen und DMARC schrittweise auf `quarantine` verschärfen.

## App
Auth-Fehler laufen über `lib/auth-errors.ts` (ungültige E-Mail, 429 mit Wartezeit, bereits registriert, schwaches Passwort), genutzt in `app/login/page.tsx` und `app/login/reset/page.tsx`. Netlify braucht keine neuen Umgebungsvariablen (SMTP lebt in Supabase).
