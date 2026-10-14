import crypto from 'crypto';
import { query, queryOne } from '@/lib/db';
import { appendIssueProgress, CLOSED_STATUSES } from '@/lib/ops-data';

// Lark app bot inbox: the app sits in an intern's group and Lark pushes every
// message to /api/lark/events. We keep each message (ops_lark_messages) and
// note it on the intern's task, so sessions can read replies with `ops show` /
// `ops lark read`. Sending still goes through the group's custom-bot webhook.
//
// Env: LARK_APP_ID, LARK_APP_SECRET, LARK_VERIFICATION_TOKEN, LARK_ENCRYPT_KEY
// (optional but recommended), LARK_API_BASE (default https://open.larksuite.com).

const API_BASE = () =>
   (process.env.LARK_API_BASE || 'https://open.larksuite.com').replace(/\/$/, '');

export function larkAppConfigured(): boolean {
   return !!(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

/* ------------------------------ event decoding ------------------------------ */

/** Lark "Encrypt Key": AES-256-CBC, key = sha256(encryptKey), IV = first 16 bytes. */
export function decryptLarkEvent(encrypt: string, encryptKey: string): string {
   const key = crypto.createHash('sha256').update(encryptKey).digest();
   const buf = Buffer.from(encrypt, 'base64');
   const decipher = crypto.createDecipheriv('aes-256-cbc', key, buf.subarray(0, 16));
   return Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]).toString('utf8');
}

/** X-Lark-Signature = sha256(timestamp + nonce + encryptKey + rawBody), hex. */
export function larkSignatureOk(headers: Headers, rawBody: string, encryptKey: string): boolean {
   const sig = headers.get('x-lark-signature');
   const ts = headers.get('x-lark-request-timestamp');
   const nonce = headers.get('x-lark-request-nonce');
   if (!sig || !ts || !nonce) return false;
   const want = crypto
      .createHash('sha256')
      .update(ts + nonce + encryptKey + rawBody)
      .digest('hex');
   const a = Buffer.from(sig);
   const b = Buffer.from(want);
   return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface Mention {
   key: string;
   name: string;
}

/** Plain text of a Lark message, with @mention placeholders replaced by names. */
export function messageText(msgType: string, content: string, mentions: Mention[] = []): string {
   let c: Record<string, unknown> = {};
   try {
      c = JSON.parse(content || '{}');
   } catch {
      return '';
   }
   let text = '';
   if (msgType === 'text') text = String(c.text ?? '');
   else if (msgType === 'post') {
      // { title, content: [[{tag:'text',text}|{tag:'a',text,href}|{tag:'at',user_name}]] }
      const body = (c.content ?? (c as Record<string, { content?: unknown }>).en_us?.content) as
         { tag: string; text?: string; href?: string; user_name?: string }[][] | undefined;
      const lines = (body ?? []).map((line) =>
         line
            .map((el) =>
               el.tag === 'a'
                  ? `${el.text ?? ''}${el.href ? ` (${el.href})` : ''}`
                  : el.tag === 'at'
                    ? `@${el.user_name ?? ''}`
                    : (el.text ?? '')
            )
            .join('')
      );
      text = [c.title ? String(c.title) : '', ...lines].filter(Boolean).join('\n');
   } else if (msgType === 'file') text = `[file: ${String(c.file_name ?? '')}]`;
   else if (msgType === 'image') text = '[image]';
   else if (msgType === 'audio') text = '[voice message]';
   else if (msgType === 'media') text = `[video${c.file_name ? ': ' + String(c.file_name) : ''}]`;
   else if (msgType === 'sticker') text = '[sticker]';
   else text = `[${msgType}]`;
   for (const m of mentions) text = text.split(m.key).join(`@${m.name}`);
   return text.trim();
}

/* ---------------------------- Lark API (names) ----------------------------- */

let tokenCache: { token: string; until: number } | null = null;
async function tenantToken(): Promise<string | null> {
   if (!larkAppConfigured()) return null;
   if (tokenCache && tokenCache.until > Date.now()) return tokenCache.token;
   try {
      const r = await fetch(`${API_BASE()}/open-apis/auth/v3/tenant_access_token/internal`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            app_id: process.env.LARK_APP_ID,
            app_secret: process.env.LARK_APP_SECRET,
         }),
      });
      const j = (await r.json()) as {
         code?: number;
         tenant_access_token?: string;
         expire?: number;
      };
      if (j.code !== 0 || !j.tenant_access_token) return null;
      tokenCache = {
         token: j.tenant_access_token,
         until: Date.now() + Math.max(60, (j.expire ?? 3600) - 300) * 1000,
      };
      return tokenCache.token;
   } catch {
      return null;
   }
}

async function larkGet<T>(path: string): Promise<T | null> {
   const t = await tenantToken();
   if (!t) return null;
   try {
      const r = await fetch(`${API_BASE()}${path}`, { headers: { Authorization: `Bearer ${t}` } });
      const j = (await r.json()) as { code?: number; data?: T };
      return j.code === 0 ? (j.data ?? null) : null;
   } catch {
      return null;
   }
}

const memberNames = new Map<string, Map<string, string>>(); // chat_id → open_id → name
const chatNames = new Map<string, string>();

async function senderName(chatId: string, openId: string): Promise<string> {
   if (!openId) return '';
   const cached = memberNames.get(chatId)?.get(openId);
   if (cached) return cached;
   const names = new Map<string, string>();
   let pageToken = '';
   for (let i = 0; i < 10; i++) {
      const d = await larkGet<{
         items?: { member_id: string; name: string }[];
         has_more?: boolean;
         page_token?: string;
      }>(
         `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members?member_id_type=open_id&page_size=100${pageToken ? '&page_token=' + encodeURIComponent(pageToken) : ''}`
      );
      if (!d) break;
      for (const m of d.items ?? []) names.set(m.member_id, m.name);
      if (!d.has_more || !d.page_token) break;
      pageToken = d.page_token;
   }
   if (names.size) memberNames.set(chatId, names);
   return names.get(openId) ?? '';
}

async function chatName(chatId: string): Promise<string> {
   if (chatNames.has(chatId)) return chatNames.get(chatId)!;
   const d = await larkGet<{ name?: string }>(
      `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`
   );
   const name = d?.name ?? '';
   if (name) chatNames.set(chatId, name);
   return name;
}

/* --------------------------------- storing --------------------------------- */

export interface LarkMessageEvent {
   header: { event_id: string; event_type: string; token?: string };
   event: {
      sender?: { sender_id?: { open_id?: string }; sender_type?: string };
      message?: {
         message_id: string;
         chat_id: string;
         chat_type?: string;
         message_type: string;
         content: string;
         create_time?: string;
         mentions?: Mention[];
      };
   };
}

/** Which task a message from this intern's group belongs to. */
async function targetTask(internId: string): Promise<string | null> {
   const r = await queryOne<{ issue_id: string | null }>(
      `SELECT COALESCE(
         (SELECT i.id FROM ops_interns n JOIN ops_issues i ON i.id = n.lark_task_id
           WHERE n.id = $1 AND i.status_id <> ALL($2)),
         (SELECT t.issue_id FROM ops_intern_tasks t WHERE t.intern_id = $1 AND t.closed_at IS NULL
           ORDER BY t.assigned_at DESC LIMIT 1)
       ) AS issue_id`,
      [internId, [...CLOSED_STATUSES]]
   );
   return r?.issue_id ?? null;
}

/** Store one group message; returns false when it was skipped or already seen. */
export async function storeLarkMessage(e: LarkMessageEvent): Promise<boolean> {
   const m = e.event.message;
   if (!m || e.header.event_type !== 'im.message.receive_v1') return false;
   if (m.chat_type && m.chat_type !== 'group') return false;
   // Only people: the bots' own posts (alerts, `ops lark`) are already on the task.
   if (e.event.sender?.sender_type && e.event.sender.sender_type !== 'user') return false;

   const openId = e.event.sender?.sender_id?.open_id ?? '';
   const text = messageText(m.message_type, m.content, m.mentions);
   const sentAt = m.create_time ? new Date(Number(m.create_time)) : new Date();
   const intern = await queryOne<{ id: string; name: string }>(
      "SELECT id, name FROM ops_interns WHERE lark_chat_id = $1 AND lark_chat_id <> ''",
      [m.chat_id]
   );
   const issueId = intern ? await targetTask(intern.id) : null;
   const [name, cname] = await Promise.all([senderName(m.chat_id, openId), chatName(m.chat_id)]);

   const ins = await query<{ id: string }>(
      `INSERT INTO ops_lark_messages
         (event_id, message_id, chat_id, chat_name, intern_id, issue_id, sender_id, sender_name, msg_type, text, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (event_id) DO NOTHING RETURNING id`,
      [
         e.header.event_id,
         m.message_id,
         m.chat_id,
         cname,
         intern?.id ?? null,
         issueId,
         openId,
         name,
         m.message_type,
         text,
         sentAt.toISOString(),
      ]
   );
   if (!ins.length) return false; // Lark retry of a message we already have
   if (issueId)
      await appendIssueProgress(issueId, `Lark · ${name || 'someone'}: ${text}`, null, 'lark');
   return true;
}

/* ------------------------------ admin queries ------------------------------ */

export async function larkChats() {
   return query<{
      chat_id: string;
      chat_name: string;
      intern: string | null;
      messages: number;
      last_at: string;
   }>(
      `SELECT m.chat_id, max(m.chat_name) AS chat_name, n.name AS intern,
              count(*)::int AS messages, max(m.sent_at) AS last_at
         FROM ops_lark_messages m LEFT JOIN ops_interns n ON n.lark_chat_id = m.chat_id
        GROUP BY m.chat_id, n.name ORDER BY last_at DESC`
   );
}

/** Bind a group to an intern; messages already received from it are attached too. */
export async function bindLarkChat(internId: string, chatId: string): Promise<void> {
   await query("UPDATE ops_interns SET lark_chat_id = '' WHERE lark_chat_id = $1 AND id <> $2", [
      chatId,
      internId,
   ]);
   await query('UPDATE ops_interns SET lark_chat_id = $1 WHERE id = $2', [chatId, internId]);
   if (chatId)
      await query(
         'UPDATE ops_lark_messages SET intern_id = $1 WHERE chat_id = $2 AND intern_id IS NULL',
         [internId, chatId]
      );
}

export async function larkMessages(internId: string, issueId: string | null, limit: number) {
   const rows = await query<{
      sender_name: string;
      text: string;
      sent_at: string;
      identifier: string | null;
   }>(
      `SELECT m.sender_name, m.text, m.sent_at, i.identifier
         FROM ops_lark_messages m LEFT JOIN ops_issues i ON i.id = m.issue_id
        WHERE m.intern_id = $1 AND ($2::uuid IS NULL OR m.issue_id = $2)
        ORDER BY m.sent_at DESC LIMIT $3`,
      [internId, issueId, limit]
   );
   return rows.reverse();
}
