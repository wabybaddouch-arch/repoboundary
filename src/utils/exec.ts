import { spawn } from "node:child_process";
import { RepoBoundaryError } from "./errors.js";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RunCommandOptions = {
  cwd: string;
  rejectOnNonZero?: boolean;
};

export class CommandExecutionError extends RepoBoundaryError {
  constructor(message: string) {
    super(message);
    this.name = "CommandExecutionError";
  }
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions
): Promise<CommandResult> {
  const rejectOnNonZero = options.rejectOnNonZero ?? true;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(
        new CommandExecutionError(
          `Failed to run ${formatCommand(command, args)}: ${error.message}`
        )
      );
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      const result = { stdout, stderr, exitCode };

      if (rejectOnNonZero && exitCode !== 0) {
        reject(
          new CommandExecutionError(
            `${formatCommand(command, args)} failed with exit code ${exitCode}: ${stderr.trim()}`
          )
        );
        return;
      }

      resolve(result);
    });
  });
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}
