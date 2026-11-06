// SERVER ONLY. Mail sender behind an interface. No-op (log only) until SMTP env vars exist.
import net from "node:net";
import tls from "node:tls";

export type MailMessage = { to: string; subject: string; text: string };
export interface Mailer { readonly configured: boolean; send(message: MailMessage): Promise<void> }

export const noopMailer: Mailer = {
  configured: false,
  async send(m) { console.log("[reminders] mail not sent (SMTP_* env missing):", m.subject); },
};

type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string };
export function smtpConfigFromEnv(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASS: pass, MAIL_FROM: from } = env;
  if (!host || !user || !pass || !from) return null;
  return { host, port: Number(port) || 465, user, pass, from };
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
export function buildMime(from: string, m: MailMessage, date = new Date()): string {
  const body = b64(m.text).replace(/(.{76})/g, "$1\r\n");
  return [`From: ${from}`, `To: ${m.to}`, `Subject: ${header(m.subject)}`, `Date: ${date.toUTCString()}`, "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", body, ""].join("\r\n");
}

/** Minimal SMTP client: implicit TLS (465) or STARTTLS (587/25) + AUTH LOGIN. */
export function createSmtpMailer(cfg: SmtpConfig): Mailer {
  const addr = (s: string) => /<([^>]+)>/.exec(s)?.[1] ?? s.trim();
  return {
    configured: true,
    async send(m) {
      if (/[\r\n]/.test(m.to + m.subject)) throw new Error("INVALID_HEADER");
      let socket: net.Socket | tls.TLSSocket = cfg.port === 465 ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.port });
      let buf = "";
      let waiter: ((code: number, text: string) => void) | null = null;
      const feed = () => { const m2 = /(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/.exec(buf); if (m2 && waiter) { const w = waiter; const t = buf; buf = ""; waiter = null; w(Number(m2[1]), t); } };
      const attach = (s: net.Socket) => { s.on("data", (d) => { buf += d.toString("utf8"); feed(); }); };
      attach(socket);
      const read = () => new Promise<{ code: number; text: string }>((res, rej) => { const t = setTimeout(() => rej(new Error("SMTP_TIMEOUT")), 20000); waiter = (code, text) => { clearTimeout(t); res({ code, text }); }; socket.once("error", rej); feed(); });
      const cmd = async (line: string, ok: number[]) => { socket.write(line + "\r\n"); const r = await read(); if (!ok.includes(r.code)) throw new Error(`SMTP_${r.code}`); return r; };
      try {
        const hello = await read(); if (hello.code !== 220) throw new Error(`SMTP_${hello.code}`);
        await cmd("EHLO wendapply", [250]);
        if (cfg.port !== 465) {
          await cmd("STARTTLS", [220]);
          socket.removeAllListeners("data");
          socket = tls.connect({ socket, host: cfg.host, servername: cfg.host }); buf = ""; attach(socket);
          await cmd("EHLO wendapply", [250]);
        }
        await cmd("AUTH LOGIN", [334]); await cmd(b64(cfg.user), [334]); await cmd(b64(cfg.pass), [235]);
        await cmd(`MAIL FROM:<${addr(cfg.from)}>`, [250]); await cmd(`RCPT TO:<${addr(m.to)}>`, [250, 251]); await cmd("DATA", [354]);
        await cmd(buildMime(cfg.from, m).replace(/^\./gm, "..") + "\r\n.", [250]);
        await cmd("QUIT", [221]).catch(() => undefined);
      } finally { socket.destroy(); }
    },
  };
}

export function getMailer(): Mailer { const cfg = smtpConfigFromEnv(); return cfg ? createSmtpMailer(cfg) : noopMailer; }
