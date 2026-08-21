# Coach-message Web Push — John setup

The athlete app can subscribe and show notifications. Sending a push when a
coach writes a chat message has to run on Supabase, not in the browser.

This environment does **not** have a linked Supabase CLI, so the function
file is in the repo but **not deployed**. Run the steps below once.

Library used: `jsr:@negrel/webpush@0.5.0` (Deno / Web Crypto). `npm:web-push`
does not work on Edge Functions.

## 1. SQL

SQL Editor, paste and run `sql/push-subscriptions.sql`.

## 2. Secrets

Do not put the private key in git, a PR, or chat.

```bash
# From a machine with the Supabase CLI, linked to project kwtbqgoqtewrlsjgepwq
supabase secrets set VAPID_PUBLIC_KEY="BP6DrkZmQspCullBBbaIlg41Z7W_AXFbefEAksCLdkdlkHBUPiJHP5YyKU7BXFBKU0sK1tJUU4v88zZtYJDRmd4"
supabase secrets set VAPID_PRIVATE_KEY="(the matching private key, url-safe base64)"
supabase secrets set VAPID_SUBJECT="mailto:YOUR_CONTACT_EMAIL"
supabase secrets set COACH_PUSH_WEBHOOK_SECRET="(long random string you make up)"
```

Dashboard alternative: Project Settings > Edge Functions > Secrets.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already injected.

## 3. Deploy the function

```bash
cd /path/to/sharp-end-exposure
supabase functions deploy notify-coach-message --no-verify-jwt
```

`--no-verify-jwt` matches `supabase/config.toml`. The function checks
`COACH_PUSH_WEBHOOK_SECRET` itself (header `x-webhook-secret` or
`Authorization: Bearer <secret>`).

Function URL:

`https://kwtbqgoqtewrlsjgepwq.supabase.co/functions/v1/notify-coach-message`

## 4. Database Webhook

Dashboard: Database > Webhooks > Create a new hook.

- Name: `notify-coach-message`
- Table: `public.coach_messages`
- Events: **Insert** only (not Update — edits must not re-ping)
- Type: HTTP Request
- Method: POST
- URL: `https://kwtbqgoqtewrlsjgepwq.supabase.co/functions/v1/notify-coach-message`
- HTTP Headers:
  - `Content-Type` = `application/json`
  - `x-webhook-secret` = the same value as `COACH_PUSH_WEBHOOK_SECRET`

Timeout: 5000ms is enough for a handful of device endpoints.

## 5. Smoke check

1. Athlete: installed PWA (iOS: Add to Home Screen), Profile > Notifications > Enable.
2. Coach: send a chat message to that athlete.
3. Athlete phone (app closed) should show "Message from your coach".
4. Tap opens SEE on Coach chat (`?open=train-chat`).

If step 3 is silent: Edge Function logs in the dashboard, then confirm the
athlete row exists in `push_subscriptions` and the webhook fired on INSERT.
