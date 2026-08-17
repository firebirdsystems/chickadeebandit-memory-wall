import { describe, it, expect } from "vitest";
import {
  parseIds, memberName, wallById, canManageWalls, canModerate, canEditPost,
  isGuestPost, postAuthor, canPostTo, visiblePosts, formatDate, formatWhen,
  searchableFields, postSearchableFields,
} from "../src/logic.js";

const MEMBERS = [
  { id: "m1", name: "Alex", role: "adult" },
  { id: "m2", name: "Casey", role: "child" },
];
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

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
