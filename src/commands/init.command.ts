import type { Command } from "commander";
import {
  configExists,
  createDefaultConfig,
  getConfigPath
} from "../config/config.service.js";
import {
  getRepoRoot,
  isInsideGitRepo
} from "../git/git.adapter.js";
import { installOrUpdatePreCommitHook } from "../git/hook-manager.js";
import {
  formatInitializationFailure,
  formatInitializationSuccess,
  formatNotGitRepositoryError
} from "../reporter/reporter.js";
import { writeStderrSync, writeStdoutSync } from "../utils/stdio.js";

export type InitExitCode = 0 | 2;

export type InitCommandRuntime = {
  getCwd: () => string;
  getHookCheckCommand: () => string | undefined;
  writeStdout: (message: string) => void;
  writeStderr: (message: string) => void;
  setExitCode: (exitCode: number) => void;
};

export type InitCommandOptions = Partial<InitCommandRuntime>;

export function registerInitCommand(
  program: Command,
  options: InitCommandOptions = {}
): void {
  const runtime = createRuntime(options);

  program
    .command("init")
    .description("Initialize RepoBoundary in the current Git repository.")
    .action(async () => {
      const exitCode = await runInitCommand(runtime);
      runtime.setExitCode(exitCode);
    });
}

export async function runInitCommand(
  runtime: InitCommandRuntime
): Promise<InitExitCode> {
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
    runtime.writeStderr(formatInitializationFailure(getErrorMessage(error)));
    return 2;
  }

  try {
    const configPath = getConfigPath(repoRoot);
    const alreadyHadConfig = await configExists(repoRoot);

    if (!alreadyHadConfig) {
      await createDefaultConfig(repoRoot);
    }

    const hook = await installOrUpdatePreCommitHook(
      repoRoot,
      runtime.getHookCheckCommand()
    );

    runtime.writeStdout(
      formatInitializationSuccess({
        configPath,
        configCreated: !alreadyHadConfig,
        hookPath: hook.hookPath
      })
    );
    return 0;
  } catch (error) {
    runtime.writeStderr(formatInitializationFailure(getErrorMessage(error)));
    return 2;
  }
}

function createRuntime(options: InitCommandOptions): InitCommandRuntime {
  return {
    getCwd: options.getCwd ?? (() => process.cwd()),
    getHookCheckCommand: options.getHookCheckCommand ?? (() => undefined),
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
