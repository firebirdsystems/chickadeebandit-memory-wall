-- Idempotency key for the `open_wall` automation action.
--
-- The dispatcher skips an action whose triggering event id is already present
-- in the dedupe column, so a rule that re-fires (a retried delivery, a calendar
-- event edited twice) cannot open a second wall for the same occasion.
--
-- Nullable with no backfill on purpose: a migration runs OUTSIDE the app-db
-- codec, so any literal written here would land as plaintext beside encrypted
-- values. Walls opened by a person leave it NULL, which is exactly right — they
-- have no triggering event.
--
-- `_id` suffix keeps the column plaintext (shouldSkipEncrypt), which the dedupe
-- lookup requires: an encrypted column uses a random IV, so `WHERE
-- source_event_id = ?` could never match and every run would duplicate.
ALTER TABLE app_memory_wall__walls ADD COLUMN source_event_id TEXT;

-- The dedupe read is a point lookup on this column before every automated run.
CREATE INDEX IF NOT EXISTS app_memory_wall__walls_source_event_idx
  ON app_memory_wall__walls (source_event_id);
