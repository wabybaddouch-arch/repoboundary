import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCli } from "../../src/cli.js";
import { CONFIG_FILE_NAME } from "../../src/config/config.constants.js";
import {
  REPOBOUNDARY_HOOK_END_MARKER,
  REPOBOUNDARY_HOOK_START_MARKER
} from "../../src/git/hook-manager.js";
import { runCommand } from "../../src/utils/exec.js";

describe("repoboundary init", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map((path) => rm(path, { recursive: true, force: true }))
    );
    tempRoots.length = 0;
  });

  it("fails clearly with exit 2 outside a Git repository", async () => {
    const nonRepo = await createTempDir("repoboundary-init-not-git-");

    const result = await runInit(nonRepo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "RepoBoundary must run inside a Git repository."
    );
    expect(result.stderr).toContain(nonRepo);
  });

  it("creates config inside a Git repository", async () => {
    const repoRoot = await createGitRepo();

    const result = await runInit(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("RepoBoundary initialized.");
    expect(result.stdout).toContain("created:");
    await expect(readConfig(repoRoot)).resolves.toBe(
      `${JSON.stringify({ version: 1, rules: [] }, null, 2)}\n`
    );
  });

  it("creates the pre-commit hook inside a Git repository", async () => {
    const repoRoot = await createGitRepo();

    const result = await runInit(repoRoot);
    const hook = await readHook(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(hook).toContain("RepoBoundary protected-file check");
    expect(hook).toContain("repoboundary check");
    expect(hook).toContain("npx --no-install repoboundary check");
  });

  it("preserves an existing config without overwriting it", async () => {
    const repoRoot = await createGitRepo();
    const existingConfig = `${JSON.stringify(
      {
        version: 1,
        rules: [
          {
            id: "auth-core",
            match: ["src/auth/**"],
            actions: ["modify"],
            mode: "block",
            reason: "Sensitive authentication logic"
          }
        ]
      },
      null,
      2
    )}\n`;
    await writeFile(join(repoRoot, CONFIG_FILE_NAME), existingConfig, "utf8");

    const result = await runInit(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("already exists:");
    await expect(readConfig(repoRoot)).resolves.toBe(existingConfig);
  });

  it("preserves existing pre-commit hook content", async () => {
    const repoRoot = await createGitRepo();
    const hookPath = preCommitHookPath(repoRoot);
    const existingHook = [
      "#!/bin/sh",
      "echo existing hook",
      ""
    ].join("\n");
    await writeFile(hookPath, existingHook, "utf8");

    const result = await runInit(repoRoot);
    const hook = await readHook(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(hook).toContain("echo existing hook");
    expect(hook.indexOf(REPOBOUNDARY_HOOK_START_MARKER)).toBeLessThan(
      hook.indexOf("echo existing hook")
    );
    expect(hook).toContain(REPOBOUNDARY_HOOK_START_MARKER);
  });

  it("does not duplicate the RepoBoundary block when run twice", async () => {
    const repoRoot = await createGitRepo();

    await runInit(repoRoot);
    const result = await runInit(repoRoot);
    const hook = await readHook(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(countOccurrences(hook, REPOBOUNDARY_HOOK_START_MARKER)).toBe(1);
    expect(countOccurrences(hook, REPOBOUNDARY_HOOK_END_MARKER)).toBe(1);
  });

  it("writes the managed markers into the hook file", async () => {
    const repoRoot = await createGitRepo();

    await runInit(repoRoot);
    const hook = await readHook(repoRoot);

    expect(hook).toContain(REPOBOUNDARY_HOOK_START_MARKER);
    expect(hook).toContain(REPOBOUNDARY_HOOK_END_MARKER);
  });

  it("makes the hook executable when supported", async () => {
    const repoRoot = await createGitRepo();

    await runInit(repoRoot);
    const hookStats = await stat(preCommitHookPath(repoRoot));

    expect(hookStats.mode & 0o111).not.toBe(0);
  });

  async function createTempDir(prefix: string): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), prefix));
    tempRoots.push(path);
    return path;
  }

  async function createGitRepo(): Promise<string> {
    const repoRoot = await createTempDir("repoboundary-init-");
    await git(repoRoot, ["init"]);
    await git(repoRoot, ["config", "user.email", "repoboundary@example.test"]);
    await git(repoRoot, ["config", "user.name", "RepoBoundary Tests"]);
    await mkdir(join(repoRoot, ".git", "hooks"), { recursive: true });
    return repoRoot;
  }
});

type InitResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runInit(cwd: string): Promise<InitResult> {
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

  await program.parseAsync(["node", "repoboundary", "init"]);

  return { exitCode, stdout, stderr };
}

async function git(repoRoot: string, args: readonly string[]): Promise<void> {
  await runCommand("git", args, { cwd: repoRoot });
}

function preCommitHookPath(repoRoot: string): string {
  return join(repoRoot, ".git", "hooks", "pre-commit");
}

async function readHook(repoRoot: string): Promise<string> {
  return readFile(preCommitHookPath(repoRoot), "utf8");
}

async function readConfig(repoRoot: string): Promise<string> {
  return readFile(join(repoRoot, CONFIG_FILE_NAME), "utf8");
}

function countOccurrences(contents: string, needle: string): number {
  return contents.split(needle).length - 1;
}
