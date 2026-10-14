// Pure, browser-free logic for Memory Wall — unit-tested in
// __tests__/logic.test.mjs. No DOM, no network, no module-level state.
//
// The permission helpers take a plain `isAdultMember` boolean rather than
// importing the hub SDK's isAdult: logic.js is imported by Node in tests, where
// "/hub-sdk.js" does not resolve. index.html supplies the flag from the SDK.

const FILE_ID = /^[0-9a-f-]{36}$/;

/** Hub file ids are UUIDs. Any member can write a file-id column with raw SQL,
 *  so the shape is checked exactly as the hub checks it before projecting a
 *  share page — a crafted id must never reach a URL the app builds. */
export function parseIds(raw) {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(v => typeof v === "string" && FILE_ID.test(v));
  } catch { return []; }
}

/** A post's `photo_thumbs`: photo id -> the id of its small copy. Arrives as
 *  the stored JSON text (or already parsed); anything else reads as no small
 *  copies at all. Both sides are held to the file-id shape for the same reason
 *  parseIds is — a small copy's id reaches a URL too. */
export function parseThumbs(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return {}; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const thumbs = {};
  for (const [photoId, thumbId] of Object.entries(parsed)) {
    if (FILE_ID.test(photoId) && typeof thumbId === "string" && FILE_ID.test(thumbId)) thumbs[photoId] = thumbId;
  }
  return thumbs;
}

/** The file to draw in a tile: the photo's small copy when it has one, else
 *  the photo itself (an older post, a photo already small, a format the
 *  browser could not draw). */
export function tilePhotoId(photoId, thumbs) {
  return (Object.hasOwn(thumbs ?? {}, photoId) && thumbs[photoId]) || photoId;
}

/** The map to store beside `file_ids`, built from the composer's photos
 *  ({ id, thumbnailId }). Only photos still in the list get an entry, so one
 *  removed before posting takes its small copy's id with it. */
export function thumbsFor(photos) {
  const thumbs = {};
  for (const photo of photos ?? []) {
    if (photo?.id && typeof photo.thumbnailId === "string" && photo.thumbnailId) thumbs[photo.id] = photo.thumbnailId;
  }
  return thumbs;
}

export function memberName(members, id) {
  return members.find(m => m.id === id)?.name ?? "Someone";
}

export function wallById(walls, id) {
  return walls.find(w => w.id === id) ?? null;
}

/** `walls` is adult_writable — opening, editing and deleting are adults-only. */
export function canManageWalls(isAdultMember) {
  return !!isAdultMember;
}

/** Who is shown the posts taken off the wall: reading `posts` by its adult
 *  visibility tier is open to any adult, in a household or a shared space. */
export function canModerate(isAdultMember) {
  return !!isAdultMember;
}

/** Whether a member may write a post someone else left. Mirrors the hub's rule
 *  for `posts` (owner_or_visibility): any adult in a household, and only the
 *  steward in a shared space. An adult who merely takes part in a space has
 *  their statement narrowed to their own posts, so it would change nothing. */
export function supervisesPosts(isAdultMember, { tenantKind = "household", isAdmin = false } = {}) {
  return tenantKind === "household" ? !!isAdultMember : isAdmin === true;
}

/** Who may delete a post: its author, and whoever supervises posts — a
 *  cosmetic gate that disagrees with the hub just shows buttons that fail. */
export function canEditPost(post, { isAdultMember, memberId, tenant } = {}) {
  return supervisesPosts(isAdultMember, tenant) || !!(post?.member_id && post.member_id === memberId);
}

/** Who may hide a post or show it again. `status` is writable by adults only
 *  (column_write_acls), and the row itself must be one the member may write. */
export function canHidePost(post, { isAdultMember, memberId, tenant } = {}) {
  return !!isAdultMember && canEditPost(post, { isAdultMember, memberId, tenant });
}

/** Deleting a wall takes every post on it. The app first deletes the posts so
 *  their photos are reclaimed, and that statement reaches other members' posts
 *  only for whoever supervises posts; for anyone else the wall's cascade would
 *  drop those rows and leave their photos behind. */
export function canDeleteWall(isAdultMember, tenant) {
  return canManageWalls(isAdultMember) && supervisesPosts(isAdultMember, tenant);
}

/** A post is genuinely external only when it has no member id — the hub forces
 *  `member_id` to the caller on every app-originated INSERT, so NULL is the one
 *  signal a member cannot forge. `source` is an ordinary member-writable column
 *  and must not be trusted for this. */
export function isGuestPost(post) {
  return !post?.member_id;
}

/** The author line: a member resolves through the roster (so a rename follows
 *  their old posts), a guest keeps the name they typed. */
export function postAuthor(post, members) {
  if (post?.member_id) return memberName(members, post.member_id);
  return post?.author_name || "A guest";
}

/** The `closed_at` to store with a wall's status. It is the share link's
 *  `submit.until_column`: the hub refuses a guest message once it has passed,
 *  which is the only thing that makes "closed" hold for a writable link (the
 *  link itself keeps resolving for open and closed walls alike). An open wall
 *  has none; a wall that is already closed keeps the time it closed. */
export function closedAtFor(status, wall, now) {
  if (status === "open") return null;
  return wall?.closed_at || now;
}

/** Only an open wall takes new messages; closed walls stay readable. */
export function canPostTo(wall) {
  return wall?.status === "open";
}

/** What the wall shows: everyone sees published posts, moderators also see the
 *  ones they hid (row policies have already removed other members' private
 *  posts before this runs). */
export function visiblePosts(posts, isAdultMember) {
  return posts.filter(p => p.status === "published" || canModerate(isAdultMember));
}

/** Taking a post off the wall. `status` alone is only a label the page reads;
 *  making the row private as well is what stops the hub handing it to children
 *  (posts are read by visibility). What it was is kept so showing it again
 *  puts it back. */
export function hidePatch(post) {
  return { status: "hidden", visibility: "private", hidden_visibility: statedVisibility(post) };
}

/** Putting a hidden post back, at the visibility its author chose. */
export function showPatch(post) {
  return { status: "published", visibility: statedVisibility(post), hidden_visibility: null };
}

/** The visibility a post's author chose: for a hidden post that is the one
 *  set aside when it was hidden, not the "private" it is held at meanwhile. */
export function statedVisibility(post) {
  const kept = post?.status === "hidden" ? post?.hidden_visibility : null;
  return kept === "everyone" || kept === "private" ? kept : post?.visibility;
}

/** A YYYY-MM-DD occasion date is household-local and has no time: pin it to
 *  midday so a timezone west of UTC cannot render it as the day before. */
export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function formatWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/**
 * Fields the walls-list search matches against (see hub-sdk `searchMatch`).
 * The occasion date is in there because a wall is remembered by when it was
 * as often as by what it was called — "the one from last June" is a date, not
 * a title. It matches the stored yyyy-mm-dd, which is what someone typing
 * "2026-06" is reaching for.
 */
export function searchableFields(wall) {
  return [wall.title, wall.description, wall.occasion_date];
}

/**
 * Fields the in-wall message search matches against. The author is the RENDERED
 * name — the roster name for a member, the typed one for a guest — so searching
 * a member's current name finds the messages they wrote under an older one,
 * and the denormalized author_name column never shadows the roster.
 */
export function postSearchableFields(post, members) {
  return [postAuthor(post, members), post.body];
}

/**
 * The line a failed share-link create or revoke shows ("Hub endpoints other than `/api/db`"
 * in the app-template guide). The SDK's share helper puts the hub's `.status` on its error;
 * the hub's text never reaches the screen.
 *   402 — on a plain link, the free plan's active-link cap (a 402 for a password, sign-ups
 *         or a longer expiry is the caller's plan line, checked before this)
 *   409 — `code: "share_link_limit"` is a paid household's active-link cap; a 409 without
 *         that code (a failure inside the mint, or an older hub) keeps "try again"
 *   400 — `code: "password_too_short"`; the caller pre-checks the length, so this is a backstop
 *   403 — not allowed, including `code: "not_owner"` (revoking another member's link);
 *   404 — the item is gone (a revoke's 404 is the caller's: the link is already gone, or an
 *         older hub refusing a non-owner — the caller re-reads the list)
 */
export function shareFailureLine(e, { action, thing } = {}) {
  if (e?.status === 402) return "Too many share links are active — revoke one first.";
  if (e?.status === 409 && e?.code === "share_link_limit") return "Too many share links are active — revoke one first.";
  if (e?.status === 400 && e?.code === "password_too_short") return "The password needs at least 6 characters.";
  if (e?.status === 403) return `You don’t have permission to ${action}.`;
  if (e?.status === 404) return `This ${thing} has been removed.`;
  return `Couldn’t ${action} — try again.`;
}
