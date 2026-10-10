-- A hidden post is held at visibility 'private' so the row policy stops
-- returning it to children; `status = 'hidden'` on its own is only a label the
-- page filters on. This column keeps the visibility the author chose
-- ('everyone' or 'private') so showing the post again restores it. NULL on a
-- post that is not hidden.
--
-- Declared in the manifest's db_plaintext_columns: the backfill below copies
-- between it and `visibility`, which is plaintext, and a migration runs
-- OUTSIDE the app-db codec.
ALTER TABLE app_memory_wall__posts ADD COLUMN hidden_visibility TEXT;

-- Posts hidden before this column existed are still readable by children.
UPDATE app_memory_wall__posts
   SET hidden_visibility = visibility, visibility = 'private'
 WHERE status = 'hidden';
