// Pure, browser-free logic for Memory Wall — unit-tested in
// __tests__/logic.test.mjs. No DOM, no network, no module-level state.
//
// The permission helpers take a plain `isAdultMember` boolean rather than
// importing the hub SDK's isAdult: logic.js is imported by Node in tests, where
// "/hub-sdk.js" does not resolve. index.html supplies the flag from the SDK.

/** Hub file ids are UUIDs. Any member can write a file-id column with raw SQL,
 *  so the shape is checked exactly as the hub checks it before projecting a
 *  share page — a crafted id must never reach a URL the app builds. */
export function parseIds(raw) {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(v => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v));
  } catch { return []; }
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

/** Moderation (hide/show any post) mirrors the `posts` row policy's adult lane. */
export function canModerate(isAdultMember) {
  return !!isAdultMember;
}

/** Mirrors the `posts` row policy exactly (owner_or_visibility: adults write any
 *  row, everyone else only their own) — a cosmetic gate that disagrees with the
 *  hub just shows buttons that 403. */
export function canEditPost(post, { isAdultMember, memberId } = {}) {
  return canModerate(isAdultMember) || !!(post?.member_id && post.member_id === memberId);
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
