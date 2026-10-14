# Ops Task API — v1

Use this API to read the tasks assigned to you, update their stage as you work, attach files, and keep the knowledge base (KB) up to date.

- **Base URL:** `https://ops.shortcastle.com/api/intern/v1`
- **Auth:** send your personal key on every request: `Authorization: Bearer <your-key>`. Keep the key secret. If it leaks, ask for it to be revoked; a new one can be issued.
- **Time zone:** every time comes back twice. `*_at` is ISO-8601 in UTC, e.g. `2026-10-14T10:10:00.000Z`. `*_ist` is a readable label in India time (IST), e.g. `14 Oct 2026, 15:40`.
- **Format:** JSON in, JSON out. File uploads use `multipart/form-data` with a field named `file`.
- **Endpoint list:** `GET /api/intern/v1` (no key needed).

---

## 1. How a task moves

```
assigned ──start──▶ in_progress ──close (summary)──▶ submitted ──(reviewed)──▶ done
                       │   ▲
                 stuck │   │ unstuck
                (reason)▼   │
                       stuck
```

| Stage         | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `assigned`    | The task has been given to you and you haven't started it yet.                |
| `in_progress` | You are working on it.                                                        |
| `stuck`       | You can't continue. Every stuck needs a reason.                               |
| `submitted`   | You closed it with a summary and it is waiting for review. Wait for feedback. |
| `done`        | Reviewed and finished.                                                        |
| `canceled`    | No longer needed.                                                             |

**Updates you post:**

- `start`: when you begin.
- `progress`: whenever you have something worth recording. Use it as often as you like.
- `stuck`: with the reason. Then `unstuck` when you can continue.
- `close`: with a proper summary covering what you did, what you found, what's left and links. This submits the task for review.

If the task was long, also attach a report file (PDF) before or after closing.

The team is notified automatically when a task is assigned to you, and when you start, get stuck (with your reason) or close it.

---

## 2. Tasks

### `GET /me`

The name and workspace the key belongs to, plus the current IST time.

### `GET /tasks?status=open|all`

Your tasks. `open` (the default) leaves out finished ones.

```json
{
   "tasks": [
      {
         "id": "TDB-70",
         "title": "…",
         "stage": "assigned",
         "backlog_code": "CLN-03",
         "priority": "P0",
         "assigned_at": "2026-10-14T09:30:00.000Z",
         "assigned_at_ist": "14 Oct 2026, 15:00",
         "updated_at": "…",
         "updated_at_ist": "…"
      }
   ]
}
```

### `GET /tasks/{id}`

One task in full:

- `description`: the brief, in markdown.
- `files`: attachments, e.g. the brief PDF. Download each one from its `url`.
- `updates`: everything you have posted on it, with IST times.

### `POST /tasks/{id}/start`

Body: `{ "text": "optional note" }`. Moves the task to `in_progress`.

### `POST /tasks/{id}/progress`

Body: `{ "text": "what you did / found" }`. Required. The stage doesn't change.

### `POST /tasks/{id}/stuck`

Body: `{ "text": "why you are stuck" }`. A reason is required. Moves the task to `stuck`.

### `POST /tasks/{id}/unstuck`

Body: `{ "text": "optional — what unblocked you" }`. Moves the task back to `in_progress`.

### `POST /tasks/{id}/close`

Body: `{ "text": "summary (markdown, at least 20 characters)" }`. Moves the task to `submitted`. After that, only `progress` notes are accepted until the task is reviewed.

### `POST /tasks/{id}/files`

Multipart with a `file` field. Attaches a file to the task.

- **Allowed types:** PDF, PNG, JPG, WEBP, Markdown, TXT, CSV.
- **Maximum size:** 25 MB.

Every action endpoint returns the updated task (the same shape as `GET /tasks/{id}`).

---

## 3. Knowledge base

The KB is the documentation of the product you work on. You can **read** the approved docs of your workspace, and **write** your own docs.

Every doc you create or edit goes to `in_review`. A reviewer then either approves it (`approved`, part of the official KB) or asks for changes (`changes_requested`). Keep the KB current:

- document the whole app first
- add or update docs whenever you build a feature, fix something or learn something
- one topic per doc, with clear titles

### `GET /kb?scope=all|mine&q=search`

Lists docs. `all` (the default) returns approved docs plus your own. `mine` returns only yours. `q` searches titles and bodies.

```json
{
   "docs": [
      {
         "id": "…",
         "title": "…",
         "category": "KB",
         "status": "approved",
         "mine": false,
         "created_at_ist": "…",
         "updated_at_ist": "…"
      }
   ]
}
```

### `GET /kb/{id}`

One doc, with its `body` (markdown) and `files`.

### `POST /kb`

Body: `{ "title": "…", "body": "markdown", "category": "KB" }`. Creates a new doc in `in_review`.

`category` is optional. It can be `KB`, `Reference`, `Runbook`, `Decision` or `Incident`, and defaults to `KB`.

### `PATCH /kb/{id}`

Body: `{ "title"?, "body"?, "category"? }`. Edits **one of your own** docs and sends it back to `in_review`.

### `POST /kb/{id}/files`

Multipart with a `file` field. Attaches a file to one of your own docs.

---

## 4. Files

### `GET /files/{id}`

Downloads a file attached to one of your tasks, or to a doc you can read. The `url` fields in task and doc responses point here. Send your key with the request.

---

## 5. Errors

Errors come back as `{ "error": "message" }` with a status code:

| Code      | When                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| 400       | Missing or invalid input, e.g. no reason on `stuck`, or a summary that's too short on `close`.   |
| 401       | Missing, wrong or revoked key.                                                                   |
| 403       | You tried to edit a doc you didn't write.                                                        |
| 404       | The task, doc or file doesn't exist, or isn't yours.                                             |
| 409       | Not allowed in the current stage, e.g. `start` on a submitted task, or `unstuck` when not stuck. |
| 413 / 415 | The file is too large, or its type isn't allowed.                                                |

---

## 6. Examples (curl)

```bash
KEY="<your-key>"; API="https://ops.shortcastle.com/api/intern/v1"

curl -s -H "Authorization: Bearer $KEY" "$API/tasks"
curl -s -H "Authorization: Bearer $KEY" "$API/tasks/TDB-70"
curl -s -H "Authorization: Bearer $KEY" -o brief.pdf "$API/files/<file-id>"

curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"text":"Starting with the data inventory"}' "$API/tasks/TDB-70/start"
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"text":"No read access to the staging database"}' "$API/tasks/TDB-70/stuck"
curl -s -X POST -H "Authorization: Bearer $KEY" -F "file=@report.pdf" "$API/tasks/TDB-70/files"
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"text":"## Done\n- …\n## Findings\n- …\n## Open\n- …"}' "$API/tasks/TDB-70/close"

curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"title":"TrainerDB — data model overview","body":"# Data model\n…"}' "$API/kb"
```
