# Task API v1: guide for team members

For a team member who works their console tasks from code or scripts, such as Sai on TrainerDB. Your key belongs to your own console account. "Your tasks" are the console tasks assigned to you in one product.

- **Base URL:** `https://ops.shortcastle.com/v1`
- **Auth:** send your personal key on every request as `Authorization: Bearer <your-key>`.
   - The key starts with `opsu_` and works for one product (e.g. TrainerDB).
   - Keep it secret. If it leaks, ask Nissi to revoke it, and a new one can be issued.
- **Time zone:** every time comes back twice.
   - `*_at` is ISO-8601 in UTC, e.g. `2026-11-13T10:10:00.000Z`.
   - `*_ist` is a readable India-time label, e.g. `13 Nov 2026, 15:40`.
- **Format:** JSON in, JSON out. File uploads use `multipart/form-data` with a field named `file`.
- **Endpoint list:** `GET /v1` (no key needed).

## 0. Signing in to the console

Open **https://ops.shortcastle.com** and click **Sign in with Google** with your `@shortcastle.com` Google account. No password is needed.

The console and the API show the same tasks. Anything you post through the API appears on the task in the console, and the reverse.

---

## 1. How a task moves

```
assigned ──start──▶ in_progress ──close (summary)──▶ submitted ──(reviewed)──▶ done
                       │   ▲
                 stuck │   │ unstuck
                (reason)▼   │
                       stuck
```

| Stage         | Meaning                                                    |
| ------------- | ---------------------------------------------------------- |
| `assigned`    | Assigned to you, not started yet.                          |
| `in_progress` | You are working on it.                                     |
| `stuck`       | You can't continue. Every stuck needs a reason.            |
| `submitted`   | You closed it with a summary and it is waiting for review. |
| `done`        | Reviewed and finished.                                     |
| `canceled`    | No longer needed.                                          |

**Updates you post:**

- `start`: when you begin.
- `progress`: whenever you have something worth recording. Use it as often as you like.
- `stuck`: with the reason. Then `unstuck` when you can continue.
- `close`: with a proper summary covering what you did, what you found, what's left and links. This submits the task for review.

If the task was long, attach a report file (PDF) before or after closing.

---

## 2. Tasks

### `GET /me`

Your name, the product your key is for (`workspace`), `key_type: "member"`, and the current IST time.

### `GET /tasks?status=open|all`

Your tasks in that product, in task-number order. `open` (the default) leaves out finished ones.

```json
{
   "tasks": [
      {
         "id": "TDB-89",
         "title": "…",
         "stage": "assigned",
         "backlog_code": null,
         "priority": null,
         "assigned_at": "2026-11-12T04:30:00.000Z",
         "assigned_at_ist": "12 Nov 2026, 10:00",
         "updated_at": "…",
         "updated_at_ist": "…"
      }
   ]
}
```

### `GET /tasks/{id}`

One task in full, returned as `{ "task": { … } }`:

- `description`: the brief, in markdown.
- `files`: the attachments. Download each one from its `url`.
- `updates`: everything you have posted on it.

### `POST /tasks/{id}/start`

Body: `{ "text": "optional note" }`. Moves the task to `in_progress`.

### `POST /tasks/{id}/progress`

Body: `{ "text": "what you did / found" }`. The text is required. The stage doesn't change.

### `POST /tasks/{id}/stuck`

Body: `{ "text": "why you are stuck" }`. A reason is required. Moves the task to `stuck`.

### `POST /tasks/{id}/unstuck`

Body: `{ "text": "optional: what unblocked you" }`. Moves the task back to `in_progress`.

### `POST /tasks/{id}/close`

Body: `{ "text": "summary (markdown, at least 20 characters)" }`. Moves the task to `submitted`.

After that, only `progress` notes are accepted until the task is reviewed.

### `POST /tasks/{id}/files`

Multipart with a `file` field. Attaches a file to the task.

- **Allowed types:** PDF, PNG, JPG, WEBP, Markdown, TXT, CSV.
- **Maximum size:** 25 MB.

Every action endpoint returns the updated task (the same shape as `GET /tasks/{id}`).

---

## 3. Knowledge base

The KB is the documentation of the product you work on. You **write** docs here and can read back the ones you wrote.

Every doc you create or edit goes to `in_review`, and Nissi reviews it. A doc then either comes back as `changes_requested` or is accepted into the official KB. Once accepted, it no longer appears in your list, but you can still find it in the console.

### `GET /kb?q=search`

Lists your docs that are in review or waiting for changes. `q` searches titles and bodies.

### `GET /kb/{id}`

One doc, with its `body` (markdown) and `files`.

### `POST /kb`

Body: `{ "title": "…", "body": "markdown", "category": "KB" }`. Creates a new doc in `in_review`.

`category` is optional. It can be `KB`, `Reference`, `Runbook`, `Decision` or `Incident`, and defaults to `KB`.

### `PATCH /kb/{id}`

Body: `{ "title"?, "body"?, "category"? }`. Edits one of **your** docs and sends it back to `in_review`.

### `POST /kb/{id}/files`

Multipart with a `file` field. Attaches a file to one of your docs.

---

## 4. Files

### `GET /files/{id}`

Downloads a file on one of your tasks, or on a doc you can read. Send your key with the request.

---

## 5. Errors

Errors come back as `{ "error": "message" }` with a status code:

| Code      | When                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| 400       | Missing or invalid input, e.g. no reason on `stuck`, or a summary that's too short on `close`.   |
| 401       | Missing, wrong or revoked key.                                                                   |
| 403       | You tried to edit a doc you didn't write.                                                        |
| 404       | The task, doc or file doesn't exist, isn't assigned to you, or is in another product.            |
| 409       | Not allowed in the current stage, e.g. `start` on a submitted task, or `unstuck` when not stuck. |
| 413 / 415 | The file is too large, or its type isn't allowed.                                                |

---

## 6. Examples (curl)

```bash
KEY="<your-key>"; API="https://ops.shortcastle.com/v1"

curl -s -H "Authorization: Bearer $KEY" "$API/me"
curl -s -H "Authorization: Bearer $KEY" "$API/tasks"
curl -s -H "Authorization: Bearer $KEY" "$API/tasks/TDB-89"

curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"text":"Starting with the moderation rules"}' "$API/tasks/TDB-89/start"
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"text":"Need read access to the prod database"}' "$API/tasks/TDB-89/stuck"
curl -s -X POST -H "Authorization: Bearer $KEY" -F "file=@report.pdf" "$API/tasks/TDB-89/files"
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"text":"## Done\n- …\n## Findings\n- …\n## Open\n- …"}' "$API/tasks/TDB-89/close"

curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"title":"TrainerDB — moderation rules","body":"# Moderation\n…"}' "$API/kb"
```
