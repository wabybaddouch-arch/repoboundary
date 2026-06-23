import type { Command } from "commander";
import { loadConfig } from "../config/config.service.js";
import {
  getRepoRoot,
  getStagedChanges,
  isInsideGitRepo
} from "../git/git.adapter.js";
import { evaluatePolicy } from "../policy/policy-engine.js";
import {
  formatBlockedCommit,
  formatInvalidConfigError,
  formatNotGitRepositoryError,
  formatSuccessfulCheck
} from "../reporter/reporter.js";
import { writeStderrSync, writeStdoutSync } from "../utils/stdio.js";

export type CheckExitCode = 0 | 1 | 2;

export type CheckCommandRuntime = {
  getCwd: () => string;
  writeStdout: (message: string) => void;
  writeStderr: (message: string) => void;
  setExitCode: (exitCode: CheckExitCode) => void;
};

export type CheckCommandOptions = Partial<CheckCommandRuntime>;

export function registerCheckCommand(
  program: Command,
  options: CheckCommandOptions = {}
): void {
  const runtime = createRuntime(options);

  program
    .command("check")
    .description("Check staged changes against RepoBoundary rules.")
    .action(async () => {
      const exitCode = await runCheckCommand(runtime);
      runtime.setExitCode(exitCode);
    });
}

export async function runCheckCommand(
  runtime: CheckCommandRuntime
): Promise<CheckExitCode> {
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
    runtime.writeStderr(formatCheckFailure(getErrorMessage(error)));
    return 2;
  }

  let config: Awaited<ReturnType<typeof loadConfig>>;

  try {
    config = await loadConfig(repoRoot);
  } catch (error) {
    runtime.writeStderr(formatInvalidConfigError(getErrorMessage(error)));
    return 2;
  }

  try {
    const stagedChanges = await getStagedChanges(repoRoot);
    const result = evaluatePolicy(config, stagedChanges);

    if (result.violations.length > 0) {
      runtime.writeStderr(formatBlockedCommit(result.violations));
      return 1;
    }

    runtime.writeStdout(formatSuccessfulCheck());
    return 0;
  } catch (error) {
    runtime.writeStderr(formatCheckFailure(getErrorMessage(error)));
    return 2;
  }
}

function createRuntime(options: CheckCommandOptions): CheckCommandRuntime {
  return {
    getCwd: options.getCwd ?? (() => process.cwd()),
    writeStdout: options.writeStdout ?? writeStdoutSync,
    writeStderr: options.writeStderr ?? writeStderrSync,
    setExitCode:
      options.setExitCode ??
      ((exitCode: CheckExitCode) => {
        process.exitCode = exitCode;
      })
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCheckFailure(message: string): string {
  return [
    "RepoBoundary check failed.",
    "",
    `Error: ${message}`,
    "",
    "To continue:",
    "- review the error above",
    "- fix the repository state if needed",
    "- run the command again"
  ].join("\n");
}
