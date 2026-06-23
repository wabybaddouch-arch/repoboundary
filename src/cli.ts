#!/usr/bin/env node
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  registerAddCommand,
  type AddCommandOptions
} from "./commands/add.command.js";
import {
  registerCheckCommand,
  type CheckCommandOptions
} from "./commands/check.command.js";
import {
  registerInitCommand,
  type InitCommandOptions
} from "./commands/init.command.js";
import {
  registerRemoveCommand,
  type RemoveCommandOptions
} from "./commands/remove.command.js";
import {
  registerStatusCommand,
  type StatusCommandOptions
} from "./commands/status.command.js";
import { writeStderrSync } from "./utils/stdio.js";

export type CliOptions = AddCommandOptions &
  CheckCommandOptions &
  InitCommandOptions &
  RemoveCommandOptions &
  StatusCommandOptions;

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

export function createCli(options: CliOptions = {}): Command {
  const program = new Command()
    .name("repoboundary")
    .description(
      "Local CLI guardrails for protected files in AI-assisted Git repositories."
    )
    .version(packageJson.version);

  registerInitCommand(program, options);
  registerCheckCommand(program, options);
  registerAddCommand(program, options);
  registerRemoveCommand(program, options);
  registerStatusCommand(program, options);

  return program;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createCli({
    getHookCheckCommand: getCurrentHookCheckCommand
  });

  if (argv.length <= 2) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(argv);
}

export function isDirectInvocation(
  invokedPath: string | undefined = process.argv[1],
  moduleUrl: string = import.meta.url
): boolean {
  if (!invokedPath) {
    return false;
  }

  return (
    resolveRealPath(invokedPath) === resolveRealPath(fileURLToPath(moduleUrl))
  );
}

function resolveRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function getCurrentHookCheckCommand(): string | undefined {
  if (process.platform === "win32" || !process.argv[1]) {
    return undefined;
  }

  return `${shellQuote(process.execPath)} ${shellQuote(
    resolveRealPath(process.argv[1])
  )} check`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

if (isDirectInvocation()) {
  void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    writeStderrSync(message);
    process.exitCode = 2;
  });
}
