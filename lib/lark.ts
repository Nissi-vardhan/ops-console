import crypto from 'crypto';

// Lark / Feishu custom-bot webhook. Domain-agnostic: we POST to whatever hook
// URL the bot hands out (open.larksuite.com international, open.feishu.cn CN).
// Set LARK_WEBHOOK_URL to enable; set LARK_SECRET too if the bot has
// "signature verification" turned on.

export function larkConfigured(): boolean {
   return !!process.env.LARK_WEBHOOK_URL;
}

// Signed request: HMAC-SHA256 with key = `${timestamp}\n${secret}`, over an
// empty string, base64-encoded. (Lark's documented custom-bot signing.)
function sign(timestamp: number, secret: string): string {
   const key = `${timestamp}\n${secret}`;
   return crypto.createHmac('sha256', key).update('').digest('base64');
}

export async function sendLarkText(text: string): Promise<{ ok: boolean; error?: string }> {
   const url = process.env.LARK_WEBHOOK_URL;
   if (!url) return { ok: false, error: 'LARK_WEBHOOK_URL not set' };

   const body: Record<string, unknown> = { msg_type: 'text', content: { text } };
   const secret = process.env.LARK_SECRET;
   if (secret) {
      const ts = Math.floor(Date.now() / 1000);
      body.timestamp = String(ts);
      body.sign = sign(ts, secret);
   }

   try {
      const res = await fetch(url, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
         code?: number;
         StatusCode?: number;
         msg?: string;
      };
      // v2 hook → { code: 0, msg: "success" }; legacy → { StatusCode: 0 }.
      const ok = res.ok && (j.code === 0 || j.StatusCode === 0);
      return ok ? { ok: true } : { ok: false, error: j.msg || `HTTP ${res.status}` };
   } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
   }
}
