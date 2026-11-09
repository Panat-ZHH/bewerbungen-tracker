// SERVER ONLY. Web Push (RFC 8030 + VAPID RFC 8292 + aes128gcm RFC 8291) on node:crypto, no extra dependency.
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();
function expand(prk: Buffer, info: Buffer, len: number) { return hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len); }

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
export function vapidFromEnv(env: Record<string, string | undefined> = process.env): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT || "mailto:support@wendapply.ch" };
}

export function vapidJwt(audience: string, keys: VapidKeys, now = Date.now()): string {
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const pub = unb64u(keys.publicKey);
  const key = createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

function freshEcdh() { const e = createECDH("prime256v1"); e.generateKeys(); return e; }

/** aes128gcm content encoding of a single record. `ephemeral`/`salt` are injectable for tests. */
export function encryptPayload(payload: Buffer, sub: PushSub, ephemeral = freshEcdh(), salt = randomBytes(16)): Buffer {
  const uaPub = unb64u(sub.p256dh), authSecret = unb64u(sub.auth);
  const shared = ephemeral.computeSecret(uaPub);
  const asPub = ephemeral.getPublicKey();
  const ikm = expand(hmac(authSecret, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32);
  const prk = hmac(salt, ikm);
  const cek = expand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, body]);
}

export type PushResult = { ok: boolean; status: number; gone: boolean };
export async function sendPush(sub: PushSub, payload: object, keys: VapidKeys, fetchImpl: typeof fetch = fetch): Promise<PushResult> {
  const url = new URL(sub.endpoint);
  if (url.protocol !== "https:") return { ok: false, status: 0, gone: true };
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: { Authorization: `vapid t=${vapidJwt(url.origin, keys)}, k=${keys.publicKey}`, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" },
    body: new Uint8Array(encryptPayload(Buffer.from(JSON.stringify(payload)), sub)),
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
