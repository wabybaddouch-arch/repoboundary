import type { Command } from "commander";
import {
  loadConfig,
  writeConfig
} from "../config/config.service.js";
import {
  getRepoRoot,
  isInsideGitRepo
} from "../git/git.adapter.js";
import {
  formatInvalidConfigError,
  formatNotGitRepositoryError,
  formatRuleRemoved
} from "../reporter/reporter.js";
import { writeStderrSync, writeStdoutSync } from "../utils/stdio.js";

export type RemoveExitCode = 0 | 2;

export type RemoveCommandRuntime = {
  getCwd: () => string;
  writeStdout: (message: string) => void;
  writeStderr: (message: string) => void;
  setExitCode: (exitCode: number) => void;
};

export type RemoveCommandOptions = Partial<RemoveCommandRuntime>;

export function registerRemoveCommand(
  program: Command,
  options: RemoveCommandOptions = {}
): void {
  const runtime = createRuntime(options);

  program
    .command("remove")
    .description("Remove a protected rule by ID.")
    .argument("<rule-id>", "Protected rule ID to remove.")
    .action(async (ruleId: string) => {
      const exitCode = await runRemoveCommand(ruleId, runtime);
      runtime.setExitCode(exitCode);
    });
}

export async function runRemoveCommand(
  ruleId: string,
  runtime: RemoveCommandRuntime
): Promise<RemoveExitCode> {
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
    runtime.writeStderr(formatRemoveFailure(getErrorMessage(error)));
    return 2;
  }

  let config: Awaited<ReturnType<typeof loadConfig>>;

  try {
    config = await loadConfig(repoRoot);
  } catch (error) {
    runtime.writeStderr(formatInvalidConfigError(getErrorMessage(error)));
    return 2;
  }

  const ruleExists = config.rules.some((rule) => rule.id === ruleId);

  if (!ruleExists) {
    runtime.writeStderr(formatRemoveFailure(`Unknown rule ID: ${ruleId}.`));
    return 2;
  }

  try {
    await writeConfig(repoRoot, {
      ...config,
      rules: config.rules.filter((rule) => rule.id !== ruleId)
    });
  } catch (error) {
    runtime.writeStderr(formatRemoveFailure(getErrorMessage(error)));
    return 2;
  }

  runtime.writeStdout(formatRuleRemoved(ruleId));
  return 0;
}

function createRuntime(options: RemoveCommandOptions): RemoveCommandRuntime {
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

function formatRemoveFailure(message: string): string {
  return [
    "RepoBoundary remove failed.",
    "",
    `Error: ${message}`,
    "",
    "To continue:",
    "- check the rule ID",
    "- make sure .repoboundary.json exists and is valid",
    "- run the command again"
  ].join("\n");
}
