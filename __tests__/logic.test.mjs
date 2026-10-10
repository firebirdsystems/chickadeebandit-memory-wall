import { describe, it, expect } from "vitest";
import {
  parseIds, parseThumbs, tilePhotoId, thumbsFor, memberName, wallById, canManageWalls, canModerate, canEditPost,
  supervisesPosts, canHidePost, canDeleteWall,
  isGuestPost, postAuthor, canPostTo, visiblePosts, formatDate, formatWhen,
  searchableFields, postSearchableFields,
  hidePatch, showPatch, statedVisibility, closedAtFor,
} from "../src/logic.js";

const MEMBERS = [
  { id: "m1", name: "Alex", role: "adult" },
  { id: "m2", name: "Casey", role: "child" },
];
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID_2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const THUMB = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const THUMB_2 = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

describe("parseIds", () => {
  it("keeps only uuid-shaped strings", () => {
    expect(parseIds(JSON.stringify([UUID]))).toEqual([UUID]);
  });

  it("drops crafted ids that would otherwise reach a file URL", () => {
    expect(parseIds(JSON.stringify([UUID, "../../etc/passwd", 7, null]))).toEqual([UUID]);
  });

  it("returns [] for null, malformed JSON and non-arrays", () => {
    expect(parseIds(null)).toEqual([]);
    expect(parseIds("not json")).toEqual([]);
    expect(parseIds('{"id":"x"}')).toEqual([]);
  });
});

describe("photo small copies", () => {
  it("reads the stored map as text or as an object", () => {
    expect(parseThumbs(JSON.stringify({ [UUID]: THUMB }))).toEqual({ [UUID]: THUMB });
    expect(parseThumbs({ [UUID]: THUMB })).toEqual({ [UUID]: THUMB });
  });

  it("reads a malformed map as no small copies", () => {
    expect(parseThumbs(null)).toEqual({});
    expect(parseThumbs(undefined)).toEqual({});
    expect(parseThumbs("not json")).toEqual({});
    expect(parseThumbs("[]")).toEqual({});
    expect(parseThumbs('"text"')).toEqual({});
    expect(parseThumbs(7)).toEqual({});
  });

  it("drops entries that are not a file id on both sides", () => {
    const stored = { [UUID]: THUMB, [UUID_2]: 7, "../../etc/passwd": THUMB_2, [THUMB_2]: "javascript:alert(1)" };
    expect(parseThumbs(JSON.stringify(stored))).toEqual({ [UUID]: THUMB });
  });

  it("draws the small copy when the photo has one, else the photo", () => {
    const thumbs = { [UUID]: THUMB };
    expect(tilePhotoId(UUID, thumbs)).toBe(THUMB);
    expect(tilePhotoId(UUID_2, thumbs)).toBe(UUID_2);
    expect(tilePhotoId("constructor", {})).toBe("constructor");
    expect(tilePhotoId(UUID, undefined)).toBe(UUID);
  });

  it("draws every photo of a post from before the column as the photo itself", () => {
    const post = { file_ids: JSON.stringify([UUID, UUID_2]), photo_thumbs: "{}" };
    const thumbs = parseThumbs(post.photo_thumbs);
    expect(parseIds(post.file_ids).map(id => tilePhotoId(id, thumbs))).toEqual([UUID, UUID_2]);
  });

  it("stores an entry only for a photo that kept a small copy", () => {
    const photos = [{ id: UUID, thumbnailId: THUMB }, { id: UUID_2 }, { id: THUMB_2, thumbnailId: null }];
    expect(thumbsFor(photos)).toEqual({ [UUID]: THUMB });
    expect(thumbsFor([])).toEqual({});
    expect(thumbsFor(undefined)).toEqual({});
  });

  it("drops a removed photo's entry with it", () => {
    const photos = [{ id: UUID, thumbnailId: THUMB }, { id: UUID_2, thumbnailId: THUMB_2 }];
    expect(thumbsFor(photos.filter(p => p.id !== UUID))).toEqual({ [UUID_2]: THUMB_2 });
  });
});

describe("roster lookups", () => {
  it("names a member and falls back for one who is gone", () => {
    expect(memberName(MEMBERS, "m1")).toBe("Alex");
    expect(memberName(MEMBERS, "departed")).toBe("Someone");
  });

  it("finds a wall by id, null when absent", () => {
    const walls = [{ id: "w1" }];
    expect(wallById(walls, "w1")).toBe(walls[0]);
    expect(wallById(walls, "w2")).toBeNull();
  });
});

describe("permission gates", () => {
  it("walls are adult-only (adult_writable)", () => {
    expect(canManageWalls(true)).toBe(true);
    expect(canManageWalls(false)).toBe(false);
  });

  it("an adult may edit any post", () => {
    expect(canEditPost({ member_id: "m2" }, { isAdultMember: true, memberId: "m1" })).toBe(true);
  });

  it("a child may edit only their own post", () => {
    expect(canEditPost({ member_id: "m2" }, { isAdultMember: false, memberId: "m2" })).toBe(true);
    expect(canEditPost({ member_id: "m1" }, { isAdultMember: false, memberId: "m2" })).toBe(false);
  });

  it("nobody claims a guest post by having no member id themselves", () => {
    // member_id NULL on both sides must not match — it is the guest marker,
    // not an ownership claim.
    expect(canEditPost({ member_id: null }, { isAdultMember: false, memberId: undefined })).toBe(false);
  });
});

describe("guest posts", () => {
  it("reads member_id, never the forgeable source column", () => {
    expect(isGuestPost({ member_id: null, source: "member" })).toBe(true);
    expect(isGuestPost({ member_id: "m1", source: "external" })).toBe(false);
  });

  it("names a member from the roster and a guest from what they typed", () => {
    expect(postAuthor({ member_id: "m1", author_name: "stale" }, MEMBERS)).toBe("Alex");
    expect(postAuthor({ member_id: null, author_name: "Grandma" }, MEMBERS)).toBe("Grandma");
    expect(postAuthor({ member_id: null, author_name: "" }, MEMBERS)).toBe("A guest");
  });
});

describe("wall state", () => {
  it("only an open wall takes messages", () => {
    expect(canPostTo({ status: "open" })).toBe(true);
    expect(canPostTo({ status: "closed" })).toBe(false);
    expect(canPostTo({ status: "archived" })).toBe(false);
    expect(canPostTo(null)).toBe(false);
  });

  it("hides moderated-off posts from everyone but a moderator", () => {
    const posts = [{ id: "a", status: "published" }, { id: "b", status: "hidden" }];
    expect(visiblePosts(posts, false).map(p => p.id)).toEqual(["a"]);
    expect(visiblePosts(posts, true).map(p => p.id)).toEqual(["a", "b"]);
  });
});

describe("search fields", () => {
  it("matches a wall on its title, its blurb and its date", () => {
    const wall = { title: "Ben's Birthday", description: "He turns six", occasion_date: "2026-06-14" };
    expect(searchableFields(wall)).toEqual(["Ben's Birthday", "He turns six", "2026-06-14"]);
  });

  it("searches a member's message by their CURRENT roster name", () => {
    // author_name is denormalized for the share page and goes stale on rename;
    // the roster is what the in-app search must match.
    const post = { member_id: "m1", author_name: "Alexander", body: "Happy birthday!" };
    expect(postSearchableFields(post, MEMBERS)).toEqual(["Alex", "Happy birthday!"]);
  });

  it("searches a guest's message by the name they typed", () => {
    const post = { member_id: null, author_name: "Grandma", body: "So proud of you" };
    expect(postSearchableFields(post, MEMBERS)).toEqual(["Grandma", "So proud of you"]);
  });
});

describe("formatting", () => {
  it("renders a household-local YYYY-MM-DD as that same day", () => {
    // Pinned to midday, so a timezone west of UTC cannot shift it a day back.
    expect(formatDate("2026-08-16")).toBe(new Date("2026-08-16T12:00:00").toLocaleDateString());
  });

  it("passes an unparseable date through and returns '' for empty", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("someday")).toBe("someday");
    expect(formatWhen("nonsense")).toBe("");
  });
});

describe("shared-space gates", () => {
  const participant = { tenantKind: "shared_space", spaceKind: "general", isAdmin: false };
  const steward = { tenantKind: "shared_space", spaceKind: "general", isAdmin: true };
  const coparentSteward = { tenantKind: "shared_space", spaceKind: "coparenting", isAdmin: true };

  it("supervising posts is any adult at home and the steward alone in a space", () => {
    expect(supervisesPosts(true)).toBe(true);
    expect(supervisesPosts(false)).toBe(false);
    expect(supervisesPosts(true, { tenantKind: "household", isAdmin: false })).toBe(true);
    expect(supervisesPosts(true, participant)).toBe(false);
    expect(supervisesPosts(true, steward)).toBe(true);
    expect(supervisesPosts(true, coparentSteward)).toBe(true);
  });

  it("a space participant deletes only their own post; the steward any", () => {
    const mine = { member_id: "m1" }, theirs = { member_id: "m2" };
    expect(canEditPost(mine, { isAdultMember: true, memberId: "m1", tenant: participant })).toBe(true);
    expect(canEditPost(theirs, { isAdultMember: true, memberId: "m1", tenant: participant })).toBe(false);
    expect(canEditPost({ member_id: null }, { isAdultMember: true, memberId: "m1", tenant: participant })).toBe(false);
    expect(canEditPost(theirs, { isAdultMember: true, memberId: "m1", tenant: steward })).toBe(true);
    expect(canEditPost({ member_id: null }, { isAdultMember: true, memberId: "m1", tenant: steward })).toBe(true);
  });

  it("hiding needs an adult and a post the member may write", () => {
    const mine = { member_id: "m1" }, theirs = { member_id: "m2" };
    // household: any adult hides any post, a child none (status is adult-only)
    expect(canHidePost(theirs, { isAdultMember: true, memberId: "m1" })).toBe(true);
    expect(canHidePost(mine, { isAdultMember: false, memberId: "m1" })).toBe(false);
    // space: a participant hides their own, the steward any, a child none
    expect(canHidePost(mine, { isAdultMember: true, memberId: "m1", tenant: participant })).toBe(true);
    expect(canHidePost(theirs, { isAdultMember: true, memberId: "m1", tenant: participant })).toBe(false);
    expect(canHidePost(theirs, { isAdultMember: true, memberId: "m1", tenant: steward })).toBe(true);
    expect(canHidePost(mine, { isAdultMember: false, memberId: "m1", tenant: participant })).toBe(false);
  });

  it("only whoever supervises posts deletes a wall", () => {
    expect(canDeleteWall(true)).toBe(true);
    expect(canDeleteWall(false)).toBe(false);
    expect(canDeleteWall(true, participant)).toBe(false);
    expect(canDeleteWall(true, steward)).toBe(true);
    expect(canDeleteWall(true, coparentSteward)).toBe(true);
    // walls stay adult-writable: a steward's flag does not stand in for it
    expect(canDeleteWall(false, steward)).toBe(false);
  });

  it("opening and editing a wall stays open to any adult", () => {
    expect(canManageWalls(true)).toBe(true);
  });
});

describe("hiding a post", () => {
  it("holds a hidden post private and remembers what its author chose", () => {
    expect(hidePatch({ status: "published", visibility: "everyone" }))
      .toEqual({ status: "hidden", visibility: "private", hidden_visibility: "everyone" });
    expect(hidePatch({ status: "published", visibility: "private" }))
      .toEqual({ status: "hidden", visibility: "private", hidden_visibility: "private" });
  });

  it("puts a shown post back at the visibility it had", () => {
    expect(showPatch({ status: "hidden", visibility: "private", hidden_visibility: "everyone" }))
      .toEqual({ status: "published", visibility: "everyone", hidden_visibility: null });
    expect(showPatch({ status: "hidden", visibility: "private", hidden_visibility: "private" }))
      .toEqual({ status: "published", visibility: "private", hidden_visibility: null });
  });

  it("keeps the current visibility for a post hidden before the column existed", () => {
    expect(showPatch({ status: "hidden", visibility: "everyone", hidden_visibility: null }))
      .toEqual({ status: "published", visibility: "everyone", hidden_visibility: null });
  });

  it("hiding twice does not lose the author's choice", () => {
    const once = { ...{ status: "published", visibility: "everyone" }, ...hidePatch({ status: "published", visibility: "everyone" }) };
    expect(hidePatch(once).hidden_visibility).toBe("everyone");
  });

  it("reports the author's choice, not the private a hidden post is held at", () => {
    expect(statedVisibility({ status: "hidden", visibility: "private", hidden_visibility: "everyone" })).toBe("everyone");
    expect(statedVisibility({ status: "published", visibility: "private", hidden_visibility: null })).toBe("private");
    // A stale value left on a published post is ignored.
    expect(statedVisibility({ status: "published", visibility: "everyone", hidden_visibility: "private" })).toBe("everyone");
  });
});

describe("closedAtFor", () => {
  const now = "2026-10-10T12:00:00.000Z";

  it("leaves an open wall with no cutoff", () => {
    expect(closedAtFor("open", { closed_at: "2026-01-01T00:00:00.000Z" }, now)).toBeNull();
  });

  it("stamps a wall the moment it closes or is archived", () => {
    expect(closedAtFor("closed", { closed_at: null }, now)).toBe(now);
    expect(closedAtFor("archived", {}, now)).toBe(now);
  });

  it("keeps the time a wall already closed, through an edit or a restore", () => {
    const wall = { closed_at: "2026-03-01T09:00:00.000Z" };
    expect(closedAtFor("closed", wall, now)).toBe(wall.closed_at);
    expect(closedAtFor("archived", wall, now)).toBe(wall.closed_at);
  });
});
