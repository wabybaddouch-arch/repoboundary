import type { Command } from "commander";
import { BOUNDARY_ACTIONS } from "../config/config.constants.js";
import {
  loadConfig,
  writeConfig
} from "../config/config.service.js";
import {
  findDuplicatePatterns,
  generateRuleId
} from "../config/rule-id.js";
import {
  getRepoRoot,
  isInsideGitRepo
} from "../git/git.adapter.js";
import {
  formatInvalidConfigError,
  formatNotGitRepositoryError,
  formatRuleAdded
} from "../reporter/reporter.js";
import type { BoundaryRule } from "../types/config.types.js";
import { writeStderrSync, writeStdoutSync } from "../utils/stdio.js";

export type AddExitCode = 0 | 2;

export type AddCommandRuntime = {
  getCwd: () => string;
  writeStdout: (message: string) => void;
  writeStderr: (message: string) => void;
  setExitCode: (exitCode: number) => void;
};

export type AddCommandOptions = Partial<AddCommandRuntime>;

export type AddCommandFlags = {
  reason?: string;
};

export function registerAddCommand(
  program: Command,
  options: AddCommandOptions = {}
): void {
  const runtime = createRuntime(options);

  program
    .command("add")
    .description("Add a protected path or glob rule.")
    .argument("<path>", "File path or glob pattern to protect.")
    .option("--reason <reason>", "Reason this path should be protected.")
    .action(async (pattern: string, flags: AddCommandFlags) => {
      const exitCode = await runAddCommand(pattern, flags, runtime);
      runtime.setExitCode(exitCode);
    });
}

export async function runAddCommand(
  pattern: string,
  flags: AddCommandFlags,
  runtime: AddCommandRuntime
): Promise<AddExitCode> {
  const reason = flags.reason?.trim();
  const normalizedPattern = pattern.trim();

  if (!reason) {
    runtime.writeStderr(
      formatAddFailure("Missing required option: --reason <reason>.")
    );
    return 2;
  }

  if (isAbsolutePathPattern(normalizedPattern)) {
    runtime.writeStderr(
      formatAddFailure(
        "Protected patterns must be Git repo-relative paths, not absolute filesystem paths."
      )
    );
    return 2;
  }

  const cwd = runtime.getCwd();
  let repoRoot: string;

  try {
    const insideGitRepo = await isInsideGitRepo(cwd);

    if (!insideGitRepo) {
      runtime.writeStderr(formatNotGitRepositoryError(cwd));
      return 2;
    }

    repoRoot = await getRepoRoot(cwd);
  } catch (error) {
    runtime.writeStderr(formatAddFailure(getErrorMessage(error)));
    return 2;
  }

  let config: Awaited<ReturnType<typeof loadConfig>>;

  try {
    config = await loadConfig(repoRoot);
  } catch (error) {
    runtime.writeStderr(formatInvalidConfigError(getErrorMessage(error)));
    return 2;
  }

  const duplicatePatterns = findDuplicatePatterns(config, [normalizedPattern]);

  if (duplicatePatterns.length > 0) {
    runtime.writeStderr(
      formatAddFailure(
        `Duplicate protected pattern: ${duplicatePatterns.join(", ")}.`
      )
    );
    return 2;
  }

  const rule: BoundaryRule = {
    id: generateRuleId(
      normalizedPattern,
      config.rules.map((existingRule) => existingRule.id)
    ),
    match: [normalizedPattern],
    actions: [...BOUNDARY_ACTIONS],
    mode: "block",
    reason
  };

  try {
    await writeConfig(repoRoot, {
      ...config,
      rules: [...config.rules, rule]
    });
  } catch (error) {
    runtime.writeStderr(formatAddFailure(getErrorMessage(error)));
    return 2;
  }

  runtime.writeStdout(formatRuleAdded(rule));
  return 0;
}

function createRuntime(options: AddCommandOptions): AddCommandRuntime {
  return {
    getCwd: options.getCwd ?? (() => process.cwd()),
    writeStdout: options.writeStdout ?? writeStdoutSync,
    writeStderr: options.writeStderr ?? writeStderrSync,
    setExitCode:
      options.setExitCode ??
      ((exitCode: number) => {
        process.exitCode = exitCode;
      })
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbsolutePathPattern(pattern: string): boolean {
  return (
    pattern.startsWith("/") ||
    /^[A-Za-z]:[\\/]/u.test(pattern) ||
    /^\\\\[^\\]/u.test(pattern)
  );
}

function formatAddFailure(message: string): string {
  return [
    "RepoBoundary add failed.",
    "",
    `Error: ${message}`,
    "",
    "To continue:",
    "- provide a Git repo-relative path and --reason",
    "- use patterns like src/auth/**, not /tmp/project/src/auth/** or C:\\project\\src\\auth\\**",
    "- make sure .repoboundary.json exists and is valid",
    "- run the command again"
  ].join("\n");
}
