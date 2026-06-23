import { describe, expect, it } from "vitest";
import {
  GitStatusParseError,
  parseGitNameStatus
} from "../../src/git/git-status.parser.js";

describe("parseGitNameStatus", () => {
  it("parses an added file", () => {
    expect(parseGitNameStatus("A\tsrc/new-file.ts\n")).toEqual([
      { action: "create", path: "src/new-file.ts" }
    ]);
  });

  it("parses a modified file", () => {
    expect(parseGitNameStatus("M\tsrc/existing-file.ts\n")).toEqual([
      { action: "modify", path: "src/existing-file.ts" }
    ]);
  });

  it("parses a deleted file", () => {
    expect(parseGitNameStatus("D\tsrc/removed-file.ts\n")).toEqual([
      { action: "delete", path: "src/removed-file.ts" }
    ]);
  });

  it("parses a renamed file with old and new paths", () => {
    expect(parseGitNameStatus("R100\tsrc/old.ts\tsrc/new.ts\n")).toEqual([
      {
        action: "rename",
        oldPath: "src/old.ts",
        newPath: "src/new.ts"
      }
    ]);
  });

  it("ignores empty output", () => {
    expect(parseGitNameStatus("\n")).toEqual([]);
  });

  it("normalizes Windows-style paths", () => {
    expect(parseGitNameStatus("M\tsrc\\auth\\session.ts\n")).toEqual([
      { action: "modify", path: "src/auth/session.ts" }
    ]);

    expect(
      parseGitNameStatus("R100\tsrc\\auth\\old.ts\tsrc\\auth\\new.ts\n")
    ).toEqual([
      {
        action: "rename",
        oldPath: "src/auth/old.ts",
        newPath: "src/auth/new.ts"
      }
    ]);
  });

  it("rejects unsupported statuses instead of guessing", () => {
    expect(() => parseGitNameStatus("C100\tsrc/a.ts\tsrc/b.ts\n")).toThrow(
      GitStatusParseError
    );
  });
});
