import { query } from '@/lib/db';

// Append-only daily standup entries — one per session per contribution. The
// nightly daily-update agent reads a day's entries and compiles them.
export interface StandupEntry {
   id: string;
   day: string;
   session: string;
   author: string;
   text: string;
   created_at: string;
}

// Re-posting from the same session on the same day REPLACES that session's entry
// (a correction/retry never piles up duplicates). Anonymous posts just append.
export async function addStandup(input: {
   day: string;
   session?: string;
   author?: string;
   text: string;
}): Promise<StandupEntry> {
   const session = (input.session ?? '').slice(0, 80);
   if (session) {
      await query('DELETE FROM ops_standup WHERE day = $1 AND session = $2', [input.day, session]);
   }
   const rows = await query<StandupEntry>(
      `INSERT INTO ops_standup (day, session, author, text)
     VALUES ($1, $2, $3, $4)
     RETURNING id, day::text, session, author, text, created_at`,
      [input.day, session, (input.author ?? '').slice(0, 80), input.text.slice(0, 4000)]
   );
   return rows[0];
}

export async function deleteStandup(id: string): Promise<boolean> {
   const rows = await query<{ id: string }>('DELETE FROM ops_standup WHERE id = $1 RETURNING id', [
      id,
   ]);
   return rows.length > 0;
}

export async function listStandup(day: string): Promise<StandupEntry[]> {
   return query<StandupEntry>(
      `SELECT id, day::text, session, author, text, created_at
     FROM ops_standup WHERE day = $1 ORDER BY created_at`,
      [day]
   );
}
