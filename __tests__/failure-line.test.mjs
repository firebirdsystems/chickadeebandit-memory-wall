import { describe, it, expect } from "vitest";
import { failureLine, uploadFailureLine } from "../src/logic.js";

const err = (props, message = "hub text") => Object.assign(new Error(message), props);
const words = { action: "post your message", thing: "message" };

describe("failureLine", () => {
  it("names what happened instead of asking for a retry", () => {
    expect(failureLine(err({ status: 400, code: "UNIQUE_CONSTRAINT" }), words)).toBe("That message already exists.");
    expect(failureLine(err({ status: 403 }), words)).toBe("You don’t have permission to post your message.");
    expect(failureLine(err({ status: 507 }), words)).toBe("The household’s storage is full — free up space first.");
    expect(failureLine(err({ status: 404 }), words)).toBe("This message has been removed.");
    expect(failureLine(err({ status: 429 }), words)).toBe("Too many tries — wait a minute and try again.");
    expect(failureLine(err({ status: 409 }), words)).toBe("This message was changed by someone else — check it first.");
  });
  it("asks for a retry only when retrying can work, never with the hub's text", () => {
    for (const e of [new TypeError("Failed to fetch"), err({ status: 0 }), err({ status: 400 }), err({ status: 500 }), err({ status: 503 }), undefined]) {
      expect(failureLine(e, words)).toBe("Couldn’t post your message — try again.");
    }
  });
  it("keeps a line the app worded for the member", () => {
    expect(failureLine(err({ forUser: true }, "A post can carry 12 photos."), words)).toBe("A post can carry 12 photos.");
  });
});

describe("uploadFailureLine", () => {
  const up = { action: "upload the photo", thing: "photo" };
  it("names the upload's own refusals", () => {
    expect(uploadFailureLine(err({ status: 413 }), up)).toBe("That file is too large.");
    expect(uploadFailureLine(err({ status: 415 }), up)).toBe("That kind of file can’t be uploaded.");
    expect(uploadFailureLine(err({ status: 429 }), up)).toBe("Too many tries — wait a minute and try again.");
  });
  it("falls back to the write table", () => {
    expect(uploadFailureLine(err({ status: 507 }), up)).toBe("The household’s storage is full — free up space first.");
    expect(uploadFailureLine(err({ status: 403 }), up)).toBe("You don’t have permission to upload the photo.");
    expect(uploadFailureLine(err({ status: 0 }, "Upload failed"), up)).toBe("Couldn’t upload the photo — try again.");
  });
});
