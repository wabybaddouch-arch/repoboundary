import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/policy-engine.js";
import type { BoundaryRule, RepoBoundaryConfig } from "../../src/types/config.types.js";
import type { StagedFileChange } from "../../src/types/git.types.js";

describe("evaluatePolicy", () => {
  it("returns no violations when there are no rules", () => {
    expect(
      evaluatePolicy(configWithRules([]), [
        { action: "modify", path: "src/auth/session.ts" }
      ]).violations
    ).toEqual([]);
  });

  it("returns no violations when there are no staged changes", () => {
    expect(evaluatePolicy(configWithRules([rule()]), []).violations).toEqual([]);
  });

  it("detects a protected modified file", () => {
    const violations = evaluatePolicy(configWithRules([rule()]), [
      { action: "modify", path: "src/auth/session.ts" }
    ]).violations;

    expect(violations).toMatchObject([
      {
        ruleId: "auth-core",
        action: "modify",
        matchedPath: "src/auth/session.ts",
        matchedPattern: "src/auth/**",
        reason: "Sensitive authentication logic"
      }
    ]);
  });

  it("detects a protected created file", () => {
    expect(
      evaluatePolicy(configWithRules([rule()]), [
        { action: "create", path: "src/auth/new-session.ts" }
      ]).violations
    ).toHaveLength(1);
  });

  it("detects a protected deleted file", () => {
    expect(
      evaluatePolicy(configWithRules([rule()]), [
        { action: "delete", path: "src/auth/session.ts" }
      ]).violations
    ).toHaveLength(1);
  });

  it("detects a protected renamed file", () => {
    const change: StagedFileChange = {
      action: "rename",
      oldPath: "src/auth/old-session.ts",
      newPath: "src/auth/new-session.ts"
    };

    expect(evaluatePolicy(configWithRules([rule()]), [change]).violations).toHaveLength(
      2
    );
  });

  it("returns no violations for an unprotected file", () => {
    expect(
      evaluatePolicy(configWithRules([rule()]), [
        { action: "modify", path: "src/ui/button.ts" }
      ]).violations
    ).toEqual([]);
  });

  it("returns no violations when the action is not listed in the rule", () => {
    expect(
      evaluatePolicy(configWithRules([rule({ actions: ["delete"] })]), [
        { action: "modify", path: "src/auth/session.ts" }
      ]).violations
    ).toEqual([]);
  });

  it("matches correctly across multiple rules", () => {
    const violations = evaluatePolicy(
      configWithRules([
        rule(),
        rule({
          id: "payments",
          match: ["src/payments/**"],
          reason: "Sensitive payment logic"
        })
      ]),
      [
        { action: "modify", path: "src/auth/session.ts" },
        { action: "modify", path: "src/payments/stripe.ts" }
      ]
    ).violations;

    expect(violations.map((violation) => violation.ruleId)).toEqual([
      "auth-core",
      "payments"
    ]);
  });

  it("matches multiple patterns inside one rule", () => {
    const violations = evaluatePolicy(
      configWithRules([rule({ match: ["src/auth/**", "src/session/**"] })]),
      [{ action: "modify", path: "src/session/store.ts" }]
    ).violations;

    expect(violations).toMatchObject([
      {
        ruleId: "auth-core",
        matchedPath: "src/session/store.ts",
        matchedPattern: "src/session/**"
      }
    ]);
  });

  it("reports a violation when a rename old path matches", () => {
    const violations = evaluatePolicy(configWithRules([rule()]), [
      {
        action: "rename",
        oldPath: "src/auth/session.ts",
        newPath: "src/ui/session.ts"
      }
    ]).violations;

    expect(violations).toMatchObject([
      {
        action: "rename",
        matchedPath: "src/auth/session.ts",
        matchedPattern: "src/auth/**"
      }
    ]);
  });

  it("reports a violation when a rename new path matches", () => {
    const violations = evaluatePolicy(configWithRules([rule()]), [
      {
        action: "rename",
        oldPath: "src/ui/session.ts",
        newPath: "src/auth/session.ts"
      }
    ]).violations;

    expect(violations).toMatchObject([
      {
        action: "rename",
        matchedPath: "src/auth/session.ts",
        matchedPattern: "src/auth/**"
      }
    ]);
  });

  it("returns multiple violations when multiple protected changes match", () => {
    expect(
      evaluatePolicy(configWithRules([rule()]), [
        { action: "modify", path: "src/auth/session.ts" },
        { action: "delete", path: "src/auth/token.ts" }
      ]).violations
    ).toHaveLength(2);
  });
});

function configWithRules(rules: BoundaryRule[]): RepoBoundaryConfig {
  return {
    version: 1,
    rules
  };
}

function rule(overrides: Partial<BoundaryRule> = {}): BoundaryRule {
  return {
    id: "auth-core",
    match: ["src/auth/**"],
    actions: ["create", "modify", "delete", "rename"],
    mode: "block",
    reason: "Sensitive authentication logic",
    ...overrides
  };
}
