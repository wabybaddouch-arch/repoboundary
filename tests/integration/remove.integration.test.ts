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
  loadConfig,
  writeConfig
} from "../../src/config/config.service.js";
import { validateConfig } from "../../src/config/config.schema.js";
import type {
  BoundaryRule,
  RepoBoundaryConfig
} from "../../src/types/config.types.js";
import { runCommand } from "../../src/utils/exec.js";

describe("repoboundary remove", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "repoboundary-remove-"));
    await initRepo(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("removes an existing rule", async () => {
    await writeConfig(repoRoot, configWithRules([authRule()]));

    const result = await runRemove(repoRoot, ["auth-core"]);
    const config = await loadConfig(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Protected rule removed.");
    expect(result.stdout).toContain("Rule: auth-core");
    expect(config.rules).toEqual([]);
  });

  it("fails clearly for an unknown rule ID", async () => {
    await writeConfig(repoRoot, configWithRules([authRule()]));

    const result = await runRemove(repoRoot, ["missing-rule"]);
    const config = await loadConfig(repoRoot);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RepoBoundary remove failed.");
    expect(result.stderr).toContain("Unknown rule ID: missing-rule.");
    expect(config.rules).toEqual([authRule()]);
  });

  it("keeps the config valid after removal", async () => {
    await writeConfig(repoRoot, configWithRules([authRule()]));

    await runRemove(repoRoot, ["auth-core"]);
    const rawConfig = JSON.parse(await readConfig(repoRoot)) as unknown;

    expect(validateConfig(rawConfig)).toEqual({
      version: 1,
      rules: []
    });
  });

  it("removes only the targeted rule", async () => {
    await writeConfig(repoRoot, configWithRules([authRule(), paymentsRule()]));

    const result = await runRemove(repoRoot, ["auth-core"]);
    const config = await loadConfig(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(config.rules).toEqual([paymentsRule()]);
  });

  it("preserves other rules", async () => {
    await writeConfig(
      repoRoot,
      configWithRules([authRule(), paymentsRule(), databaseRule()])
    );

    await runRemove(repoRoot, ["payments"]);
    const config = await loadConfig(repoRoot);

    expect(config.rules).toEqual([authRule(), databaseRule()]);
  });

  it("fails clearly outside a Git repository", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "repoboundary-remove-not-git-"));

    try {
      const result = await runRemove(nonRepo, ["auth-core"]);

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

  it("fails clearly before init when config is missing", async () => {
    const result = await runRemove(repoRoot, ["auth-core"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "RepoBoundary could not read a valid config."
    );
    expect(result.stderr).toContain(CONFIG_FILE_NAME);
  });

  it("fails clearly and does not write when config is invalid", async () => {
    const configPath = join(repoRoot, CONFIG_FILE_NAME);
    const invalidConfig = `${JSON.stringify(
      { version: 2, rules: [authRule()] },
      null,
      2
    )}\n`;
    await writeFile(configPath, invalidConfig, "utf8");

    const result = await runRemove(repoRoot, ["auth-core"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "RepoBoundary could not read a valid config."
    );
    expect(result.stderr).toContain("version");
    await expect(readFile(configPath, "utf8")).resolves.toBe(invalidConfig);
  });
});

type RemoveResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runRemove(
  cwd: string,
  args: readonly string[]
): Promise<RemoveResult> {
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

  await program.parseAsync(["node", "repoboundary", "remove", ...args]);

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

async function readConfig(repoRoot: string): Promise<string> {
  return readFile(join(repoRoot, CONFIG_FILE_NAME), "utf8");
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

function databaseRule(): BoundaryRule {
  return {
    id: "database-schema",
    match: ["prisma/schema.prisma"],
    actions: ["modify"],
    mode: "block",
    reason: "Database schema changes require review"
  };
}
