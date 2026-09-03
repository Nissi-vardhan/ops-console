import { getPool } from '@/lib/db';

// Idempotent schema for the standalone ops-console DB (opsdb). Runs on server
// boot via instrumentation.ts. This is the OPS half only — split out of the
// tracker so ops.shortcastle.com owns its own data + accounts.
const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ops accounts (independent of the tracker). Copied over with existing bcrypt
-- hashes at migration time; managed here going forward.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  username      text NOT NULL,
  avatar_url    text,
  plan          text NOT NULL DEFAULT 'free',
  role          text NOT NULL DEFAULT 'member',   -- owner | admin | member | viewer
  ops_access    boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
UPDATE users SET role = 'owner', ops_access = true WHERE lower(email) = 'nissi@shortcastle.com';
UPDATE users SET role = 'admin' WHERE lower(email) IN ('arun@shortcastle.com', 'raghu@shortcastle.com') AND role = 'member';

CREATE TABLE IF NOT EXISTS ops_projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text DEFAULT '',
  status_id        text NOT NULL DEFAULT 'to-do',
  priority_id      text NOT NULL DEFAULT 'no-priority',
  lead_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  health           text NOT NULL DEFAULT 'on-track',
  percent_complete integer NOT NULL DEFAULT 0,
  start_date       date,
  target_date      date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS ops_issue_seq START 1;
CREATE TABLE IF NOT EXISTS ops_issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint NOT NULL DEFAULT nextval('ops_issue_seq'),
  identifier   text UNIQUE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  status_id    text NOT NULL DEFAULT 'to-do',
  priority_id  text NOT NULL DEFAULT 'no-priority',
  assignee_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  project_id   uuid REFERENCES ops_projects(id) ON DELETE SET NULL,
  label_ids    text[] NOT NULL DEFAULT '{}',
  rank         text NOT NULL DEFAULT '0|hzzzzz:',
  due_date     date,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  progress     text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_issues_status ON ops_issues(status_id);
CREATE INDEX IF NOT EXISTS idx_ops_issues_project ON ops_issues(project_id);

CREATE TABLE IF NOT EXISTS ops_services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  kind            text NOT NULL DEFAULT 'service',
  url             text,
  owner           text,
  notes           text NOT NULL DEFAULT '',
  expires_at      date,
  last_rotated_at date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_docs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT 'Doc',
  pinned      boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_cadences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  audience    text NOT NULL DEFAULT '',
  channels    text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft',
  issue_id    uuid REFERENCES ops_issues(id) ON DELETE SET NULL,
  touches     jsonb NOT NULL DEFAULT '[]',
  blockers    jsonb NOT NULL DEFAULT '[]',
  notes       text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_embeddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind  text NOT NULL,
  source_id    uuid NOT NULL,
  ref          text NOT NULL DEFAULT '',
  title        text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT '',
  chunk_ix     int  NOT NULL DEFAULT 0,
  content      text NOT NULL DEFAULT '',
  source_hash  text NOT NULL,
  embedding    jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id, chunk_ix)
);
CREATE INDEX IF NOT EXISTS idx_ops_emb_source ON ops_embeddings(source_kind, source_id);

CREATE TABLE IF NOT EXISTS app_json (
  key        text PRIMARY KEY,
  value      jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Compiled end-of-day updates (one per IST calendar day). content = the clean,
-- copy-ready summary; raw = the deterministic per-task digest it was built from.
CREATE TABLE IF NOT EXISTS ops_daily_updates (
  day          date PRIMARY KEY,
  content      text NOT NULL DEFAULT '',
  raw          text NOT NULL DEFAULT '',
  data         jsonb,   -- structured {sections:[{heading,summary,detail[]}], pending[]}
  edited       boolean NOT NULL DEFAULT false,  -- true once a human saved edits to content
  generated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops_daily_updates ADD COLUMN IF NOT EXISTS data jsonb;
ALTER TABLE ops_daily_updates ADD COLUMN IF NOT EXISTS edited boolean NOT NULL DEFAULT false;

-- Google-gated public share links for docs. One link per doc; allowed_emails is
-- the Google-account allow-list a viewer must sign in as to read the doc.
CREATE TABLE IF NOT EXISTS ops_doc_shares (
  token          text PRIMARY KEY,
  doc_id         uuid NOT NULL REFERENCES ops_docs(id) ON DELETE CASCADE,
  allowed_emails text[] NOT NULL DEFAULT '{}',
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id)
);

-- Feedback threads on docs (and tasks). target_kind = 'doc' | 'issue'. Each
-- comment is attributed by name so Nissi can see who wrote what; reviewers on a
-- shared doc are attributed by their (Google) email.
CREATE TABLE IF NOT EXISTS ops_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind  text NOT NULL,
  target_id    text NOT NULL,
  author_name  text NOT NULL DEFAULT '',
  author_email text NOT NULL DEFAULT '',
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_comments_target ON ops_comments(target_kind, target_id, created_at);

-- File attachments for docs (PDFs etc). Bytes live in object storage (MinIO);
-- this row holds the metadata + object key. Scoped to a doc so the share page
-- can gate access to just that doc's files.
CREATE TABLE IF NOT EXISTS ops_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       uuid REFERENCES ops_docs(id) ON DELETE CASCADE,
  filename     text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size         bigint NOT NULL DEFAULT 0,
  object_key   text NOT NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_attachments_doc ON ops_attachments(doc_id);

-- The task "Journey": each ops_issue records its work as ordered, checkable steps
-- across 5 phases (plan -> prepare -> execute -> verify -> done). Every step keeps
-- its own completion history (done_at/done_by) so the log is "every step, stored".
CREATE TABLE IF NOT EXISTS ops_task_steps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   uuid NOT NULL REFERENCES ops_issues(id) ON DELETE CASCADE,
  phase      text NOT NULL DEFAULT 'plan',    -- plan | prepare | execute | verify | done
  seq        integer NOT NULL DEFAULT 0,      -- order within the phase
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'pending', -- pending | doing | done | skipped
  note       text NOT NULL DEFAULT '',
  done_at    timestamptz,
  done_by    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_task_steps_issue ON ops_task_steps(issue_id, phase, seq);

-- Denormalised board pointer: the earliest phase with an incomplete step (or
-- 'done' when all steps are complete, NULL when a task has no journey yet).
ALTER TABLE ops_issues ADD COLUMN IF NOT EXISTS current_phase text;

-- Doc review workflow: one stage per doc (review | changes | approved), set by
-- reviewers (on the shared link) or the owner. ops_doc_reviews is the history —
-- every stage change, with the "request changes" note, attributed by name/email.
CREATE TABLE IF NOT EXISTS ops_doc_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       uuid NOT NULL REFERENCES ops_docs(id) ON DELETE CASCADE,
  stage        text NOT NULL,                 -- review | changes | approved
  note         text NOT NULL DEFAULT '',
  author_name  text NOT NULL DEFAULT '',
  author_email text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_doc_reviews_doc ON ops_doc_reviews(doc_id, created_at);
ALTER TABLE ops_docs ADD COLUMN IF NOT EXISTS review_stage text;

-- Many-to-many links between docs and tasks (a runbook ↔ the task it documents),
-- surfaced on both the doc detail and the task detail.
CREATE TABLE IF NOT EXISTS ops_doc_links (
  doc_id     uuid NOT NULL REFERENCES ops_docs(id) ON DELETE CASCADE,
  issue_id   uuid NOT NULL REFERENCES ops_issues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, issue_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_doc_links_issue ON ops_doc_links(issue_id);

-- Append-only daily standup: each session posts what it worked on (via the ops
-- standup CLI), and the nightly daily-update agent compiles the day's entries.
CREATE TABLE IF NOT EXISTS ops_standup (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day        date NOT NULL,
  session    text NOT NULL DEFAULT '',
  author     text NOT NULL DEFAULT '',
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ops_standup_day ON ops_standup(day, created_at);
-- Full session id + cwd so a past update can hand back a claude --resume command.
ALTER TABLE ops_standup ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE ops_standup ADD COLUMN IF NOT EXISTS cwd text;
`;

let migrated = false;

export async function runMigrations(): Promise<void> {
   if (migrated) return;
   const pool = getPool();
   await pool.query(SCHEMA_SQL);
   migrated = true;
   console.log('[migrate] ops schema ensured');
}
