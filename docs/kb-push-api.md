# Knowledge base push API

Use this to send your product documentation to our knowledge base, and to keep it up to date whenever you change something.

- **Base URL:** `https://ops.shortcastle.com/api/kb/push`
- **Auth:** send your push key in every request: `Authorization: Bearer kbp_…`
   - The key only works for your product's knowledge base.
   - Keep it secret, and don't commit it to a repository.
- **Format:** JSON in, JSON out. Article bodies are Markdown.
- **Review:** everything you push goes into review on our side, and goes live only after we approve it. If you change an article that is already live, your change waits for review, and the live version stays as it is until then.

## Push or update articles

`POST /api/kb/push`

Send one article:

```json
{
   "ref": "getting-started",
   "title": "Trainerstack — Getting started",
   "body": "# Getting started\n\nSign up at …",
   "audience": "support"
}
```

Or up to 100 at once:

```json
{
   "docs": [
      { "ref": "…", "title": "…", "body": "…" },
      { "ref": "…", "title": "…", "body": "…" }
   ]
}
```

| Field      | Required | Notes                                                                                                                                                                                    |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref`      | yes      | Your own stable id for the article, e.g. `pricing` or `features/scheduling`. Letters, numbers, `.` `_` `/` `-`, up to 120 characters. Pushing the same `ref` again updates that article. |
| `title`    | yes      | 3–300 characters. Start it with the product name, e.g. "Trainerstack — Pricing".                                                                                                         |
| `body`     | yes      | Markdown, up to 200,000 characters.                                                                                                                                                      |
| `audience` | no       | `support` (default): facts a customer-facing assistant may use. `marketing`: positioning and sales notes for our team only.                                                              |

Response:

```json
{
   "workspace": "trainerstack",
   "results": [
      { "ref": "getting-started", "result": "created", "status": "in_review" },
      { "ref": "pricing", "result": "update_staged", "status": "live" }
   ],
   "ok": 2,
   "failed": 0
}
```

`result` is `created`, `updated` (an article not live yet), `update_staged` (a live article; your change waits for review) or `error` (with an `error` message). One bad article doesn't stop the others.

## List your articles

`GET /api/kb/push` returns each article's `ref`, `title`, `audience`, `status` (`in_review`, `live` or `changes_requested`), `pending_edit` (true if a change is waiting for review) and `updated_at`.

## Remove an article

`DELETE /api/kb/push?ref=<ref>` removes an article that was never live. To remove a live article, ask us.

## Examples (curl)

```bash
curl -X POST https://ops.shortcastle.com/api/kb/push \
  -H "Authorization: Bearer $KB_PUSH_KEY" -H "Content-Type: application/json" \
  -d '{"ref":"getting-started","title":"Trainerstack — Getting started","body":"# Getting started\n\n…"}'

curl https://ops.shortcastle.com/api/kb/push -H "Authorization: Bearer $KB_PUSH_KEY"
```

## Good practice

- One article per topic (pricing, sign-up, each main feature, FAQs, troubleshooting), rather than one huge document.
- Keep `ref`s stable, so updates replace the right article.
- Whenever you ship a change, push the affected articles again.
- Write facts only: no secrets, keys, passwords or customers' personal data.
