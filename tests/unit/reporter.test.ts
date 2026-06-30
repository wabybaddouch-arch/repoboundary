import { describe, expect, it } from "vitest";
import {
  formatBlockedCommit,
  formatInitializationFailure,
  formatInitializationSuccess,
  formatInvalidConfigError,
  formatNotGitRepositoryError,
  formatRuleAdded,
  formatRuleRemoved,
  formatStatus,
  formatSuccessfulCheck
} from "../../src/reporter/reporter.js";
import type { BoundaryRule } from "../../src/types/config.types.js";
import type { PolicyViolation } from "../../src/types/policy.types.js";

describe("reporter formatters", () => {
  it("formats a no-violation result", () => {
    expect(formatSuccessfulCheck()).toBe(
      "RepoBoundary check passed. No protected staged changes found."
    );
  });

  it("formats a single violation", () => {
    const output = formatBlockedCommit([violation()]);

    expect(output).toContain("RepoBoundary blocked this commit.");
    expect(output).toContain("Protected files were changed:");
    expect(output).toContain("1. src/auth/session.ts");
    expect(output).toContain("Action: modify");
    expect(output).toContain("Rule: auth-core");
    expect(output).toContain("Reason: Sensitive authentication logic");
    expect(output).toContain("To continue:");
    expect(output).toContain("- review the diff manually");
    expect(output).toContain("- revert the protected changes");
    expect(output).toContain(
      "- or update/remove the rule if this change is intentional"
    );
  });

  it("formats multiple violations", () => {
    const output = formatBlockedCommit([
      violation(),
      violation({
        ruleId: "database-schema",
        matchedPath: "prisma/schema.prisma",
        matchedPattern: "prisma/schema.prisma",
        reason: "Database schema changes require explicit review"
      })
    ]);

    expect(output).toContain("1. src/auth/session.ts");
    expect(output).toContain("2. prisma/schema.prisma");
    expect(output).toContain("Rule: auth-core");
    expect(output).toContain("Rule: database-schema");
  });

  it("formats an invalid config error", () => {
    const output = formatInvalidConfigError("rules: Required");

    expect(output).toContain("RepoBoundary could not read a valid config.");
    expect(output).toContain("Error: rules: Required");
    expect(output).toContain("To continue:");
    expect(output).toContain("- fix .repoboundary.json");
  });

  it("formats rule list for status", () => {
    const output = formatStatus({
      repoRoot: "/repo",
      configPath: "/repo/.repoboundary.json",
      configStatus: "valid",
      hookInstalled: false,
      rules: [rule()]
    });

    expect(output).toContain("RepoBoundary status");
    expect(output).toContain("Repository: /repo");
    expect(output).toContain("Config status: valid");
    expect(output).toContain("Pre-commit hook: not installed");
    expect(output).toContain("Rules: 1");
    expect(output).toContain("1. auth-core");
    expect(output).toContain("Match: src/auth/**");
    expect(output).toContain("Actions: create, modify, delete, rename");
    expect(output).toContain("Reason: Sensitive authentication logic");
  });

  it("formats an empty status rule list", () => {
    const output = formatStatus({
      repoRoot: "/repo",
      configPath: "/repo/.repoboundary.json",
      configStatus: "valid",
      hookInstalled: true,
      rules: []
    });

    expect(output).toContain("No protected rules configured.");
  });

  it("formats invalid config status output", () => {
    const output = formatStatus({
      repoRoot: "/repo",
      configPath: "/repo/.repoboundary.json",
      configStatus: "invalid",
      configError: "version: Invalid input",
      hookInstalled: false,
      rules: []
    });

    expect(output).toContain("Config status: invalid");
    expect(output).toContain("Config error: version: Invalid input");
    expect(output).toContain("Rules: 0");
  });

  it("ensures blocked output contains action, rule ID, reason, and file path", () => {
    const output = formatBlockedCommit([violation()]);

    expect(output).toMatch(/Action: modify/u);
    expect(output).toMatch(/Rule: auth-core/u);
    expect(output).toMatch(/Reason: Sensitive authentication logic/u);
    expect(output).toMatch(/src\/auth\/session\.ts/u);
  });

  it("formats not-a-Git-repository errors", () => {
    const output = formatNotGitRepositoryError("/tmp/example");

    expect(output).toContain("RepoBoundary must run inside a Git repository.");
    expect(output).toContain("Current directory: /tmp/example");
    expect(output).toContain("git init");
  });

  it("formats rule added output", () => {
    const output = formatRuleAdded(rule());

    expect(output).toContain("Protected rule added.");
    expect(output).toContain("Rule: auth-core");
    expect(output).toContain("Match: src/auth/**");
  });

  it("formats rule removed output", () => {
    const output = formatRuleRemoved("auth-core");

    expect(output).toContain("Protected rule removed.");
    expect(output).toContain("Rule: auth-core");
  });

  it("formats initialization success output", () => {
    const output = formatInitializationSuccess({
      configPath: ".repoboundary.json",
      configCreated: true,
      hookPath: ".git/hooks/pre-commit"
    });

    expect(output).toContain("RepoBoundary initialized.");
    expect(output).toContain("created: .repoboundary.json");
    expect(output).toContain("installed or updated: .git/hooks/pre-commit");
    expect(output).toContain("Next:");
  });

  it("formats initialization success when config already exists", () => {
    const output = formatInitializationSuccess({
      configPath: ".repoboundary.json",
      configCreated: false,
      hookPath: ".git/hooks/pre-commit"
    });

    expect(output).toContain("already exists: .repoboundary.json");
    expect(output).toContain("Next:");
  });

  it("formats initialization failure output", () => {
    const output = formatInitializationFailure("could not install hook");

    expect(output).toContain("RepoBoundary init failed.");
    expect(output).toContain("Error: could not install hook");
    expect(output).toContain("To continue:");
  });
});

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

function violation(overrides: Partial<PolicyViolation> = {}): PolicyViolation {
  return {
    ruleId: "auth-core",
    action: "modify",
    matchedPath: "src/auth/session.ts",
    matchedPattern: "src/auth/**",
    reason: "Sensitive authentication logic",
    change: {
      action: "modify",
      path: "src/auth/session.ts"
    },
    ...overrides
  };
}
