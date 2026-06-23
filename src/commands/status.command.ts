import type { Command } from "commander";
import {
  configExists,
  getConfigPath,
  loadConfig
} from "../config/config.service.js";
import {
  getRepoRoot,
  isInsideGitRepo
} from "../git/git.adapter.js";
import { getPreCommitHookStatus } from "../git/hook-manager.js";
import {
  formatNotGitRepositoryError,
  formatStatus
} from "../reporter/reporter.js";
import type { BoundaryRule } from "../types/config.types.js";
import { writeStderrSync, writeStdoutSync } from "../utils/stdio.js";

export type StatusExitCode = 0 | 2;

export type StatusCommandRuntime = {
  getCwd: () => string;
  writeStdout: (message: string) => void;
  writeStderr: (message: string) => void;
  setExitCode: (exitCode: number) => void;
};

export type StatusCommandOptions = Partial<StatusCommandRuntime>;

export function registerStatusCommand(
  program: Command,
  options: StatusCommandOptions = {}
): void {
  const runtime = createRuntime(options);

  program
    .command("status")
    .description("Show RepoBoundary configuration and hook status.")
    .action(async () => {
      const exitCode = await runStatusCommand(runtime);
      runtime.setExitCode(exitCode);
    });
}

export async function runStatusCommand(
  runtime: StatusCommandRuntime
): Promise<StatusExitCode> {
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
    runtime.writeStderr(formatStatusFailure(getErrorMessage(error)));
    return 2;
  }

  try {
    const configPath = getConfigPath(repoRoot);
    const hook = await getPreCommitHookStatus(repoRoot);
    const configState = await getConfigState(repoRoot);

    runtime.writeStdout(
      formatStatus({
        repoRoot,
        configPath,
        configStatus: configState.status,
        configError: configState.error,
        hookInstalled: hook.installed,
        rules: configState.rules
      })
    );
    return 0;
  } catch (error) {
    runtime.writeStderr(formatStatusFailure(getErrorMessage(error)));
    return 2;
  }
}

type ConfigState =
  | {
      status: "missing";
      rules: BoundaryRule[];
      error?: undefined;
    }
  | {
      status: "valid";
      rules: BoundaryRule[];
      error?: undefined;
    }
  | {
      status: "invalid";
      rules: BoundaryRule[];
      error: string;
    };

async function getConfigState(repoRoot: string): Promise<ConfigState> {
  const exists = await configExists(repoRoot);

  if (!exists) {
    return {
      status: "missing",
      rules: []
    };
  }

  try {
    const config = await loadConfig(repoRoot);

    return {
      status: "valid",
      rules: config.rules
    };
  } catch (error) {
    return {
      status: "invalid",
      rules: [],
      error: getErrorMessage(error)
    };
  }
}

function createRuntime(options: StatusCommandOptions): StatusCommandRuntime {
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

function formatStatusFailure(message: string): string {
  return [
    "RepoBoundary status failed.",
    "",
    `Error: ${message}`,
    "",
    "To continue:",
    "- review the error above",
    "- fix the repository state if needed",
    "- run the command again"
  ].join("\n");
}
