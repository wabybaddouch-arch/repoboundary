import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCli } from "../../src/cli.js";
import { CONFIG_FILE_NAME } from "../../src/config/config.constants.js";
import {
  createDefaultConfig,
  loadConfig,
  writeConfig
} from "../../src/config/config.service.js";
import { validateConfig } from "../../src/config/config.schema.js";
import type { RepoBoundaryConfig } from "../../src/types/config.types.js";
import { runCommand } from "../../src/utils/exec.js";

describe("repoboundary add", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "repoboundary-add-"));
    await initRepo(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("adds a file path rule", async () => {
    await createDefaultConfig(repoRoot);

    const result = await runAdd(repoRoot, [
      "prisma/schema.prisma",
      "--reason",
      "Database schema changes require review"
    ]);
    const config = await loadConfig(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Protected rule added.");
    expect(config.rules).toEqual([
      {
        id: "prisma-schema",
        match: ["prisma/schema.prisma"],
        actions: ["create", "modify", "delete", "rename"],
        mode: "block",
        reason: "Database schema changes require review"
      }
    ]);
  });

  it("adds a glob path rule", async () => {
    await createDefaultConfig(repoRoot);

    const result = await runAdd(repoRoot, [
      "src/auth/**",
      "--reason",
      "Sensitive authentication logic"
    ]);
    const config = await loadConfig(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(config.rules[0]?.match).toEqual(["src/auth/**"]);
    expect(config.rules[0]?.id).toBe("src-auth");
  });

  it("fails clearly when reason is missing", async () => {
    await createDefaultConfig(repoRoot);

    const result = await runAdd(repoRoot, ["src/auth/**"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RepoBoundary add failed.");
    expect(result.stderr).toContain("Missing required option: --reason");
    await expect(loadConfig(repoRoot)).resolves.toEqual({
      version: 1,
      rules: []
    });
  });

  it("rejects absolute filesystem paths", async () => {
    await createDefaultConfig(repoRoot);
    const absolutePatterns = [
      "/tmp/project/src/auth/**",
      "C:\\project\\src\\auth\\**",
      "C:/project/src/auth/**"
    ];

    for (const pattern of absolutePatterns) {
      const result = await runAdd(repoRoot, [
        pattern,
        "--reason",
        "Sensitive authentication logic"
      ]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("RepoBoundary add failed.");
      expect(result.stderr).toContain(
        "Protected patterns must be Git repo-relative paths"
      );
    }

    await expect(loadConfig(repoRoot)).resolves.toEqual({
      version: 1,
      rules: []
    });
  });

  it("fails clearly for a duplicate pattern", async () => {
    await writeConfig(repoRoot, configWithRules());

    const result = await runAdd(repoRoot, [
      "src/auth/**",
      "--reason",
      "Duplicate authentication rule"
    ]);
    const config = await loadConfig(repoRoot);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RepoBoundary add failed.");
    expect(result.stderr).toContain("Duplicate protected pattern: src/auth/**.");
    expect(config.rules).toHaveLength(1);
    expect(config.rules[0]?.reason).toBe("Sensitive authentication logic");
  });

  it("generates a correct deterministic rule ID", async () => {
    await writeConfig(repoRoot, configWithRules());

    const result = await runAdd(repoRoot, [
      "src/payments/stripe.ts",
      "--reason",
      "Sensitive payment logic"
    ]);
    const config = await loadConfig(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(config.rules[1]?.id).toBe("src-payments-stripe");
    expect(result.stdout).toContain("Rule: src-payments-stripe");
  });

  it("keeps the config valid after adding a rule", async () => {
    await createDefaultConfig(repoRoot);

    await runAdd(repoRoot, [
      ".github/workflows/**",
      "--reason",
      "Deployment configuration requires review"
    ]);
    const rawConfig = JSON.parse(await readConfig(repoRoot)) as unknown;

    expect(validateConfig(rawConfig)).toEqual({
      version: 1,
      rules: [
        {
          id: "github-workflows",
          match: [".github/workflows/**"],
          actions: ["create", "modify", "delete", "rename"],
          mode: "block",
          reason: "Deployment configuration requires review"
        }
      ]
    });
  });

  it("fails clearly outside a Git repository", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "repoboundary-add-not-git-"));

    try {
      const result = await runAdd(nonRepo, [
        "src/auth/**",
        "--reason",
        "Sensitive authentication logic"
      ]);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(
        "RepoBoundary must run inside a Git repository."
      );
      expect(result.stderr).toContain(nonRepo);
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });

  it("fails clearly before init when config is missing", async () => {
    const result = await runAdd(repoRoot, [
      "src/auth/**",
      "--reason",
      "Sensitive authentication logic"
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "RepoBoundary could not read a valid config."
    );
    expect(result.stderr).toContain(CONFIG_FILE_NAME);
  });
});

type AddResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runAdd(
  cwd: string,
  args: readonly string[]
): Promise<AddResult> {
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

  await program.parseAsync(["node", "repoboundary", "add", ...args]);

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

function configWithRules(): RepoBoundaryConfig {
  return {
    version: 1,
    rules: [
      {
        id: "src-auth",
        match: ["src/auth/**"],
        actions: ["create", "modify", "delete", "rename"],
        mode: "block",
        reason: "Sensitive authentication logic"
      }
    ]
  };
}
