import { describe, expect, it } from "vitest";
import { matchesAnyPattern } from "../../src/policy/matcher.js";

describe("matchesAnyPattern", () => {
  it("returns the matching glob pattern", () => {
    expect(matchesAnyPattern("src/auth/session.ts", ["src/auth/**"])).toBe(
      "src/auth/**"
    );
  });

  it("returns the first matching pattern when multiple patterns match", () => {
    expect(
      matchesAnyPattern("src/auth/session.ts", ["src/**", "src/auth/**"])
    ).toBe("src/**");
  });

  it("returns undefined when no pattern matches", () => {
    expect(matchesAnyPattern("src/ui/button.ts", ["src/auth/**"])).toBe(
      undefined
    );
  });

  it("matches dotfile paths when a pattern targets them", () => {
    expect(matchesAnyPattern(".github/workflows/ci.yml", [".github/**"])).toBe(
      ".github/**"
    );
  });
});
