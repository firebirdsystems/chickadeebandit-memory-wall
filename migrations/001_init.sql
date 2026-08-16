-- Memory Wall: one wall per occasion, many posts on it.
--
-- Migrations are additive only: add 002_*.sql, 003_*.sql for later changes.
-- Never DROP/RENAME; the runner applies each version exactly once, in order.

-- A wall is the shareable item. `adult_writable`: adults open and manage walls,
-- everyone in the household reads them.
CREATE TABLE IF NOT EXISTS app_memory_wall__walls (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  occasion_date   TEXT NOT NULL DEFAULT '',   -- YYYY-MM-DD, household-local (plaintext: _date)
  description     TEXT NOT NULL DEFAULT '',
  cover_file_ids  TEXT NOT NULL DEFAULT '[]', -- JSON array of hub file ids (one cover today)

  -- open: accepting posts · closed: read-only, share links still resolve
  -- archived: hidden from share links entirely (shareable.visible_where)
  -- CHECK is enforceable here only because these enum columns are plaintext
  -- (an encrypted column's constraint is dead — the codec writes ciphertext).
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'archived')),

  -- The wall's own privacy switch, read by shareable.feed.parent_where: with
  -- "organizers", a visitor sees the occasion but not a single message.
  post_visibility TEXT NOT NULL DEFAULT 'everyone'
                    CHECK (post_visibility IN ('everyone', 'organizers')),

  created_by      TEXT NOT NULL,              -- member id of the organizer
  created_at      TEXT NOT NULL
);

-- One message on a wall. Members post through the app; external guests post
-- through a premium writable share link, which inserts here directly (source
-- 'external', member_id NULL).
CREATE TABLE IF NOT EXISTS app_memory_wall__posts (
  id          TEXT PRIMARY KEY,
  wall_id     TEXT NOT NULL,
  member_id   TEXT,                           -- NULL for external guests
  author_name TEXT NOT NULL DEFAULT '',       -- what a guest typed; members render from the roster
  body        TEXT NOT NULL DEFAULT '',
  file_ids    TEXT NOT NULL DEFAULT '[]',     -- JSON array of hub file ids (photos)
  -- Written by the hub's share-submit path as 'external'. NOT a trustworthy
  -- signal on its own: it is an ordinary member-writable column, so the app
  -- reads `member_id IS NULL` to tell a real guest from a member claiming to be
  -- one. Kept for provenance in exports and admin queries.
  source      TEXT NOT NULL DEFAULT 'member'
                CHECK (source IN ('member', 'external')),

  -- published: on the wall · hidden: moderated off it. Drives the public feed
  -- filter, so hiding a post unpublishes its photos with it.
  status      TEXT NOT NULL DEFAULT 'published'
                CHECK (status IN ('published', 'hidden')),

  -- everyone: the whole household (and the public wall) · private: the author
  -- and adults only, never a share link.
  visibility  TEXT NOT NULL DEFAULT 'everyone'
                CHECK (visibility IN ('everyone', 'private')),

  created_at  TEXT NOT NULL
);

-- The wall's own feed, newest first, and the share-link feed's exact filter.
CREATE INDEX IF NOT EXISTS app_memory_wall__posts_wall_idx
  ON app_memory_wall__posts (wall_id, status, visibility, created_at);

-- The per-wall published-message counts on the walls list, which filter on
-- status before grouping by wall.
CREATE INDEX IF NOT EXISTS app_memory_wall__posts_count_idx
  ON app_memory_wall__posts (status, wall_id);

-- Walls list, newest occasion first.
CREATE INDEX IF NOT EXISTS app_memory_wall__walls_created_idx
  ON app_memory_wall__walls (created_at);
