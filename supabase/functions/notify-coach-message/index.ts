// Coach-message Web Push sender.
// Library: jsr:@negrel/webpush@0.5.0 (Deno / Web Crypto, RFC 8291 + 8292).
// npm:web-push does not work in Supabase Edge Functions (Node crypto).
//
// Trigger: Database Webhook on public.coach_messages INSERT.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT,
//          COACH_PUSH_WEBHOOK_SECRET. Never commit the private key.
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:see@straydog-labs.github.io";
const WEBHOOK_SECRET = Deno.env.get("COACH_PUSH_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function vapidKeysFromUrlBase64(
  publicKey: string,
  privateKey: string,
): Promise<CryptoKeyPair> {
  const pub = urlBase64ToUint8Array(publicKey);
  const priv = urlBase64ToUint8Array(privateKey);
  if (pub.length !== 65 || pub[0] !== 4) {
    throw new Error("VAPID public key must be an uncompressed P-256 point");
  }
  const dBytes = priv.length >= 32 ? priv.slice(priv.length - 32) : priv;
  const x = bytesToB64Url(pub.slice(1, 33));
  const y = bytesToB64Url(pub.slice(33, 65));
  const d = bytesToB64Url(dBytes);
  const privateCrypto = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const publicCrypto = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return { privateKey: privateCrypto, publicKey: publicCrypto };
}

function webhookAuthorized(req: Request): boolean {
  if (!WEBHOOK_SECRET) return false;
  const header = req.headers.get("x-webhook-secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return header === WEBHOOK_SECRET || bearer === WEBHOOK_SECRET;
}

function clip(text: string, max: number): string {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function recordFromBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (obj.record && typeof obj.record === "object") return obj.record as Record<string, unknown>;
  if (obj.type === "INSERT" && obj.table === "coach_messages") return obj as Record<string, unknown>;
  return obj;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!webhookAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
    return new Response("Push sender is not configured", { status: 500 });
  }

  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch (_e) {
    return new Response("Invalid JSON", { status: 400 });
  }
  const record = recordFromBody(payload);
  if (!record) return new Response(JSON.stringify({ skipped: "no record" }), { status: 200 });

  const athleteId = String(record.athlete_id || "");
  const senderId = String(record.sender_id || "");
  const bodyText = String(record.body || "");
  if (!athleteId || senderId === athleteId) {
    return new Response(JSON.stringify({ skipped: "not a coach-to-athlete insert" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rowsRes = await fetch(
    SUPABASE_URL + "/rest/v1/push_subscriptions?user_id=eq." + encodeURIComponent(athleteId) + "&select=id,endpoint,p256dh,auth",
    {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: "Bearer " + SERVICE_ROLE,
      },
    },
  );
  if (!rowsRes.ok) {
    return new Response("Could not load subscriptions", { status: 500 });
  }
  const rows = await rowsRes.json();
  if (!Array.isArray(rows) || !rows.length) {
    return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const vapidKeys = await vapidKeysFromUrlBase64(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: VAPID_SUBJECT,
    vapidKeys,
  });

  const message = JSON.stringify({
    title: "Message from your coach",
    body: clip(bodyText, 120) || "Open SEE to read it.",
    url: "./index.html?open=train-chat",
  });

  let sent = 0;
  const gone: string[] = [];
  for (const row of rows) {
    try {
      const sub = appServer.subscribe({
        endpoint: String(row.endpoint),
        keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
      });
      await sub.pushTextMessage(message, { ttl: 60 * 60 * 24, urgency: "high" });
      sent++;
    } catch (err) {
      const goneFn = err && typeof (err as { isGone?: unknown }).isGone === "function"
        ? (err as { isGone: () => boolean }).isGone()
        : false;
      const status = Number((err as { statusCode?: number; status?: number }).statusCode
        || (err as { status?: number }).status || 0);
      if (goneFn || status === 404 || status === 410) gone.push(String(row.id));
      else console.error("push failed", row.endpoint, err);
    }
  }

  if (gone.length) {
    const filter = gone.map((id) => `"${id}"`).join(",");
    await fetch(
      SUPABASE_URL + "/rest/v1/push_subscriptions?id=in.(" + filter + ")",
      {
        method: "DELETE",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: "Bearer " + SERVICE_ROLE,
        },
      },
    );
  }

  return new Response(JSON.stringify({ sent, gone: gone.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
