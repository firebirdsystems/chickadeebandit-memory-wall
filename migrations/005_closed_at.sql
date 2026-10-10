-- When a wall stopped taking messages: an ISO instant, NULL while it is open.
--
-- The share link's `submit.until_column`. A link resolves for open and closed
-- walls alike (shareable.visible_where), so without a cutoff a writable link
-- to a "closed" wall went on accepting guest messages. The hub refuses a
-- submission once this time has passed, and the public page closes its form.
--
-- Plaintext by its `_at` suffix, which the cutoff comparison requires.
ALTER TABLE app_memory_wall__walls ADD COLUMN closed_at TEXT;

-- Walls already closed or archived stop taking guest messages too. Any past
-- instant does; the wall's own creation time is one every row has.
UPDATE app_memory_wall__walls
   SET closed_at = created_at
 WHERE status IN ('closed', 'archived');
