import { describe, expect, it } from "vitest";
import {
  GitStatusParseError,
  parseGitNameStatus
} from "../../src/git/git-status.parser.js";

describe("parseGitNameStatus", () => {
  it("parses an added file", () => {
    expect(parseGitNameStatus("A\0src/new-file.ts\0")).toEqual([
      { action: "create", path: "src/new-file.ts" }
    ]);
  });

  it("parses a modified file", () => {
    expect(parseGitNameStatus("M\0src/existing-file.ts\0")).toEqual([
      { action: "modify", path: "src/existing-file.ts" }
    ]);
  });

  it("parses a deleted file", () => {
    expect(parseGitNameStatus("D\0src/removed-file.ts\0")).toEqual([
      { action: "delete", path: "src/removed-file.ts" }
    ]);
  });

  it("parses a renamed file with old and new paths", () => {
    expect(parseGitNameStatus("R100\0src/old.ts\0src/new.ts\0")).toEqual([
      {
        action: "rename",
        oldPath: "src/old.ts",
        newPath: "src/new.ts"
      }
    ]);
  });

  it("ignores empty output", () => {
    expect(parseGitNameStatus("")).toEqual([]);
  });

  it("normalizes Windows-style paths", () => {
    expect(parseGitNameStatus("M\0src\\auth\\session.ts\0")).toEqual([
      { action: "modify", path: "src/auth/session.ts" }
    ]);

    expect(
      parseGitNameStatus("R100\0src\\auth\\old.ts\0src\\auth\\new.ts\0")
    ).toEqual([
      {
        action: "rename",
        oldPath: "src/auth/old.ts",
        newPath: "src/auth/new.ts"
      }
    ]);
  });

  it("preserves Unicode filenames", () => {
    expect(parseGitNameStatus("A\0src/auth/café.ts\0")).toEqual([
      { action: "create", path: "src/auth/café.ts" }
    ]);
  });

  it("preserves tabs and newlines in filenames", () => {
    expect(parseGitNameStatus("A\0src/auth/odd\tname\n.ts\0")).toEqual([
      { action: "create", path: "src/auth/odd\tname\n.ts" }
    ]);
  });

  it("rejects unsupported statuses instead of guessing", () => {
    expect(() => parseGitNameStatus("C100\0src/a.ts\0src/b.ts\0")).toThrow(
      GitStatusParseError
    );
  });
});
