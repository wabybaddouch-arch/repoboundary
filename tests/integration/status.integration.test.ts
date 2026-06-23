import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCli } from "../../src/cli.js";
import { CONFIG_FILE_NAME } from "../../src/config/config.constants.js";
import {
  createDefaultConfig,
  writeConfig
} from "../../src/config/config.service.js";
import type {
  BoundaryRule,
  RepoBoundaryConfig
} from "../../src/types/config.types.js";
import { runCommand } from "../../src/utils/exec.js";

describe("repoboundary status", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "repoboundary-status-"));
    await initRepo(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("reports status before init", async () => {
    const result = await runStatus(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("RepoBoundary status");
    expect(result.stdout).toContain(`Repository: ${repoRoot}`);
    expect(result.stdout).toContain(`Config: ${join(repoRoot, CONFIG_FILE_NAME)}`);
    expect(result.stdout).toContain("Config status: missing");
    expect(result.stdout).toContain("Pre-commit hook: not installed");
    expect(result.stdout).toContain("Rules: 0");
    expect(result.stdout).toContain("No protected rules configured.");
  });

  it("reports status after init", async () => {
    await runInit(repoRoot);

    const result = await runStatus(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Config status: valid");
    expect(result.stdout).toContain("Pre-commit hook: installed");
    expect(result.stdout).toContain("Rules: 0");
    expect(result.stdout).toContain("No protected rules configured.");
  });

  it("reports configured rules", async () => {
    await writeConfig(repoRoot, configWithRules([authRule(), paymentsRule()]));

    const result = await runStatus(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Config status: valid");
    expect(result.stdout).toContain("Rules: 2");
    expect(result.stdout).toContain("1. auth-core");
    expect(result.stdout).toContain("Match: src/auth/**");
    expect(result.stdout).toContain("Reason: Sensitive authentication logic");
    expect(result.stdout).toContain("2. payments");
    expect(result.stdout).toContain("Match: src/payments/**");
    expect(result.stdout).toContain("Reason: Sensitive payment logic");
  });

  it("reports a missing hook", async () => {
    await createDefaultConfig(repoRoot);

    const result = await runStatus(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Config status: valid");
    expect(result.stdout).toContain("Pre-commit hook: not installed");
  });

  it("reports invalid config without writing", async () => {
    const configPath = join(repoRoot, CONFIG_FILE_NAME);
    const invalidConfig = `${JSON.stringify(
      { version: 2, rules: [authRule()] },
      null,
      2
    )}\n`;
    await writeFile(configPath, invalidConfig, "utf8");

    const result = await runStatus(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Config status: invalid");
    expect(result.stdout).toContain("Config error:");
    expect(result.stdout).toContain("version");
    expect(result.stdout).toContain("Rules: 0");
    await expect(readFile(configPath, "utf8")).resolves.toBe(invalidConfig);
  });

  it("fails clearly outside a Git repository", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "repoboundary-status-not-git-"));

    try {
      const result = await runStatus(nonRepo);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        "RepoBoundary must run inside a Git repository."
      );
      expect(result.stderr).toContain(nonRepo);
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });
});

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runStatus(cwd: string): Promise<CommandResult> {
  return runCli(cwd, ["status"]);
}

async function runInit(cwd: string): Promise<CommandResult> {
  return runCli(cwd, ["init"]);
}

async function runCli(
  cwd: string,
  args: readonly string[]
): Promise<CommandResult> {
  let exitCode = 0;
  let stdout = "";
  let stderr = "";

  const program = createCli({
    getCwd: () => cwd,
    setExitCode: (code) => {
      exitCode = code;
    },
    writeStdout: (message) => {
      stdout += message;
    },
    writeStderr: (message) => {
      stderr += message;
    }
  });

  await program.parseAsync(["node", "repoboundary", ...args]);

  return { exitCode, stdout, stderr };
}

async function initRepo(repoRoot: string): Promise<void> {
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "repoboundary@example.test"]);
  await git(repoRoot, ["config", "user.name", "RepoBoundary Tests"]);
}

async function git(repoRoot: string, args: readonly string[]): Promise<void> {
  await runCommand("git", args, { cwd: repoRoot });
}

function configWithRules(rules: BoundaryRule[]): RepoBoundaryConfig {
  return {
    version: 1,
    rules
  };
}

function authRule(): BoundaryRule {
  return {
    id: "auth-core",
    match: ["src/auth/**"],
    actions: ["create", "modify", "delete", "rename"],
    mode: "block",
    reason: "Sensitive authentication logic"
  };
}

function paymentsRule(): BoundaryRule {
  return {
    id: "payments",
    match: ["src/payments/**"],
    actions: ["create", "modify", "delete", "rename"],
    mode: "block",
    reason: "Sensitive payment logic"
  };
}
