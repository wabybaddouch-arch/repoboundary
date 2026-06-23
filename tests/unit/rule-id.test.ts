import { describe, expect, it } from "vitest";
import {
  findDuplicatePatterns,
  generateRuleId
} from "../../src/config/rule-id.js";
import type { RepoBoundaryConfig } from "../../src/types/config.types.js";

describe("generateRuleId", () => {
  it("generates a deterministic human-readable ID from a glob path", () => {
    expect(generateRuleId("src/auth/**")).toBe("src-auth");
    expect(generateRuleId("prisma/schema.prisma")).toBe("prisma-schema");
  });

  it("adds a numeric suffix when the generated ID already exists", () => {
    expect(generateRuleId("src/auth/**", ["src-auth"])).toBe("src-auth-2");
    expect(generateRuleId("src/auth/**", ["src-auth", "src-auth-2"])).toBe(
      "src-auth-3"
    );
  });

  it("falls back to rule when a pattern has no readable characters", () => {
    expect(generateRuleId("**")).toBe("rule");
  });
});

describe("findDuplicatePatterns", () => {
  it("detects duplicate patterns against existing config rules", () => {
    const config: RepoBoundaryConfig = {
      version: 1,
      rules: [
        {
          id: "auth-core",
          match: ["src/auth/**"],
          actions: ["modify"],
          mode: "block",
          reason: "Sensitive authentication logic"
        }
      ]
    };

    expect(findDuplicatePatterns(config, ["src/auth/**"])).toEqual([
      "src/auth/**"
    ]);
  });

  it("detects duplicates inside the candidate patterns", () => {
    const config: RepoBoundaryConfig = {
      version: 1,
      rules: []
    };

    expect(findDuplicatePatterns(config, ["src/auth/**", "src/auth/**"])).toEqual([
      "src/auth/**"
    ]);
  });
});
