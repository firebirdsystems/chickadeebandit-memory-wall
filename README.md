# Memory Wall

Open a wall for an occasion — a birthday, a farewell, a new arrival — and collect everyone's messages and photos in one place. Share a link and guests can read it, or add to it, without an account.

## Model

| Table | What it holds |
| --- | --- |
| `walls` | One occasion. Title, date, description, cover photo, status, and the wall's own privacy switch. `adult_writable`: adults open and manage walls, everyone reads them. |
| `posts` | One message. Body, photos (`file_ids`), author, moderation status, per-post visibility. `owner_or_visibility`: you always see your own, everyone sees the public ones, adults see and moderate all. |

### The three switches that decide who sees what

1. **`walls.status`** — `open` accepts messages, `closed` is read-only but share links still resolve, `archived` drops the wall out of the app *and* stops every share link (`shareable.visible_where` admits only open/closed).
2. **`walls.post_visibility`** — the wall's own "visitors may read the messages" switch. Set to `organizers`, a share link shows the occasion and nothing else; the hub does not even read the posts table (`shareable.feed.parent_where`).
3. **`posts.visibility`** — `private` keeps a message to its author and the household's adults. It never reaches a share link, because the public feed filters on `visibility = 'everyone'`.

Moderation is the fourth: flipping a post to `status = 'hidden'` removes it from the public wall on the next load, and its photos stop downloading with it — the share-link file endpoint only serves files attached to an entry the feed would render.

## Sharing

Read-only sharing is free. The premium `sharing` capability unlocks guest messages (`shareable.submit`), password-protected links, and 1-year expiry. Those controls appear in the Share modal only for entitled households; there is no in-app upsell.

Guest messages are Turnstile-gated, rate-limited per link and per IP, capped at 200 per link, and land as `source = 'external'` with `member_id` NULL so they are always distinguishable from a member's post.

## Known limits

- **Guests cannot attach photos.** The share-link write surface is text-only platform-wide. Members' photos render on the public wall; a guest can only write. Lifting this needs an anonymous upload endpoint in the hub — the planned phase 2, at which point the wall gains a per-wall pre-approval setting for guest photos.
- **Deleting a wall deletes its posts first, deliberately.** `delete_file_list_columns` reclaims a post's photos when that post is deleted; the `walls → posts` `delete_cascades` entry can only drop rows. Deleting the parent alone would strand the photos in storage.
- **A post's photos are fixed once posted.** Change them by deleting the post and writing a new one — that keeps the app off the unlink-on-UPDATE lane entirely.

## Development

```bash
make setup     # once per clone: enables the pre-push hook (build + tests)
npm install
npm run dev    # local dev server, demo mode (no hub attached)
npm test
npm run build  # writes dist/
```
