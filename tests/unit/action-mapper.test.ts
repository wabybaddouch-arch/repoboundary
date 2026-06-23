import { describe, expect, it } from "vitest";
import {
  getChangeAction,
  isActionAllowedByRule
} from "../../src/policy/action-mapper.js";
import type { BoundaryRule } from "../../src/types/config.types.js";

describe("action mapper", () => {
  const rule: BoundaryRule = {
    id: "auth-core",
    match: ["src/auth/**"],
    actions: ["modify", "delete"],
    mode: "block",
    reason: "Sensitive authentication logic"
  };

  it("returns the action from a staged change", () => {
    expect(getChangeAction({ action: "create", path: "src/auth/new.ts" })).toBe(
      "create"
    );
    expect(
      getChangeAction({
        action: "rename",
        oldPath: "src/auth/old.ts",
        newPath: "src/auth/new.ts"
      })
    ).toBe("rename");
  });

  it("checks whether a rule includes an action", () => {
    expect(isActionAllowedByRule("modify", rule)).toBe(true);
    expect(isActionAllowedByRule("create", rule)).toBe(false);
  });
});
