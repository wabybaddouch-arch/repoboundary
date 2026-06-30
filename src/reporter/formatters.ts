import type { BoundaryRule } from "../types/config.types.js";
import type { PolicyViolation } from "../types/policy.types.js";

export type StatusFormatterInput = {
  repoRoot: string;
  configPath: string;
  configStatus: "missing" | "valid" | "invalid";
  configError?: string;
  hookInstalled: boolean;
  rules: readonly BoundaryRule[];
};

export type InitializationSuccessInput = {
  configPath: string;
  configCreated: boolean;
  hookPath: string;
};

export function formatSuccessfulCheck(): string {
  return "RepoBoundary check passed. No protected staged changes found.";
}

export function formatBlockedCommit(
  violations: readonly PolicyViolation[]
): string {
  const violationLines = violations
    .map(
      (violation, index) => `${index + 1}. ${violation.matchedPath}
   Action: ${violation.action}
   Rule: ${violation.ruleId}
   Reason: ${violation.reason}`
    )
    .join("\n\n");

  return [
    "RepoBoundary blocked this commit.",
    "",
    "Protected files were changed:",
    "",
    violationLines,
    "",
    "To continue:",
    "- review the diff manually",
    "- revert the protected changes",
    "- or update/remove the rule if this change is intentional"
  ].join("\n");
}

export function formatInvalidConfigError(message: string): string {
  return [
    "RepoBoundary could not read a valid config.",
    "",
    `Error: ${message}`,
    "",
    "To continue:",
    "- fix .repoboundary.json",
    "- make sure the config matches the supported schema",
    "- run the command again"
  ].join("\n");
}

export function formatNotGitRepositoryError(cwd: string): string {
  return [
    "RepoBoundary must run inside a Git repository.",
    "",
    `Current directory: ${cwd}`,
    "",
    "To continue:",
    "- change into a Git repository",
    "- or initialize one with git init before using RepoBoundary"
  ].join("\n");
}

export function formatStatus(input: StatusFormatterInput): string {
  const ruleLines =
    input.rules.length === 0
      ? ["No protected rules configured."]
      : input.rules.flatMap((rule, index) => [
          `${index + 1}. ${rule.id}`,
          `   Match: ${rule.match.join(", ")}`,
          `   Mode: ${rule.mode}`,
          `   Actions: ${rule.actions.join(", ")}`,
          `   Reason: ${rule.reason}`
        ]);
  const configLines = [
    `Config: ${input.configPath}`,
    `Config status: ${input.configStatus}`
  ];

  if (input.configError) {
    configLines.push(`Config error: ${input.configError}`);
  }

  return [
    "RepoBoundary status",
    "",
    `Repository: ${input.repoRoot}`,
    ...configLines,
    `Pre-commit hook: ${input.hookInstalled ? "installed" : "not installed"}`,
    `Rules: ${input.rules.length}`,
    "",
    "Protected rules:",
    "",
    ...ruleLines
  ].join("\n");
}

export function formatRuleAdded(rule: BoundaryRule): string {
  return [
    "Protected rule added.",
    "",
    `Rule: ${rule.id}`,
    `Match: ${rule.match.join(", ")}`,
    `Mode: ${rule.mode}`,
    `Actions: ${rule.actions.join(", ")}`,
    `Reason: ${rule.reason}`
  ].join("\n");
}

export function formatRuleRemoved(ruleId: string): string {
  return [
    "Protected rule removed.",
    "",
    `Rule: ${ruleId}`,
    "",
    "RepoBoundary will no longer block changes for that rule."
  ].join("\n");
}

export function formatInitializationSuccess(
  input: InitializationSuccessInput
): string {
  const configStatus = input.configCreated ? "created" : "already exists";

  return [
    "RepoBoundary initialized.",
    "",
    "Config:",
    `- ${configStatus}: ${input.configPath}`,
    "",
    "Pre-commit hook:",
    `- installed or updated: ${input.hookPath}`,
    "",
    "Next:",
    "- add protected rules to .repoboundary.json",
    "- run repoboundary check to verify staged changes"
  ].join("\n");
}

export function formatInitializationFailure(message: string): string {
  return [
    "RepoBoundary init failed.",
    "",
    `Error: ${message}`,
    "",
    "To continue:",
    "- review the error above",
    "- fix the repository state if needed",
    "- run the command again"
  ].join("\n");
}
