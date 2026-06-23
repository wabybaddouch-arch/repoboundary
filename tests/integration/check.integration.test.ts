import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCli } from "../../src/cli.js";
import { writeConfig } from "../../src/config/config.service.js";
import type { RepoBoundaryConfig } from "../../src/types/config.types.js";
import { runCommand } from "../../src/utils/exec.js";

describe("repoboundary check", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "repoboundary-check-"));
    await initRepo(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("fails clearly with exit 2 when config is missing", async () => {
    const result = await runCheck(repoRoot);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "RepoBoundary could not read a valid config."
    );
    expect(result.stderr).toContain(".repoboundary.json");
  });

  it("fails clearly with exit 2 outside a Git repository", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "repoboundary-not-git-"));

    try {
      const result = await runCheck(nonRepo);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(
        "RepoBoundary must run inside a Git repository."
      );
      expect(result.stderr).toContain(nonRepo);
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });

  it("fails clearly with exit 2 when config is invalid", async () => {
    await writeFile(
      join(repoRoot, ".repoboundary.json"),
      JSON.stringify({ version: 2, rules: [] }, null, 2)
    );

    const result = await runCheck(repoRoot);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "RepoBoundary could not read a valid config."
    );
    expect(result.stderr).toContain("version");
  });

  it("passes with exit 0 when config is valid and there are no staged changes", async () => {
    await writeConfig(repoRoot, protectedConfig());

    const result = await runCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(
      "RepoBoundary check passed. No protected staged changes found."
    );
    expect(result.stderr).toBe("");
  });

  it("passes with exit 0 for an unprotected staged file", async () => {
    await writeConfig(repoRoot, protectedConfig());
    await writeRepoFile(repoRoot, "src/ui/button.ts", "export const button = true;\n");
    await git(repoRoot, ["add", "src/ui/button.ts"]);

    const result = await runCheck(repoRoot);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("RepoBoundary check passed.");
    expect(result.stderr).toBe("");
  });

  it("fails with exit 1 for a protected staged file", async () => {
    await writeConfig(repoRoot, protectedConfig());
    await writeRepoFile(
      repoRoot,
      "src/auth/session.ts",
      "export const session = true;\n"
    );
    await git(repoRoot, ["add", "src/auth/session.ts"]);

    const result = await runCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("RepoBoundary blocked this commit.");
    expect(result.stderr).toContain("src/auth/session.ts");
    expect(result.stderr).toContain("Action: create");
    expect(result.stderr).toContain("Rule: auth-core");
    expect(result.stderr).toContain("Reason: Sensitive authentication logic");
  });

  it("works from a subdirectory inside the repository", async () => {
    await writeConfig(repoRoot, protectedConfig());
    await writeRepoFile(
      repoRoot,
      "src/auth/session.ts",
      "export const session = true;\n"
    );
    await git(repoRoot, ["add", "src/auth/session.ts"]);
    const subdirectory = join(repoRoot, "src", "auth");

    const result = await runCheck(subdirectory);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("src/auth/session.ts");
  });

  it("fails with exit 1 for a protected rename", async () => {
    await writeConfig(repoRoot, protectedConfig());
    await writeRepoFile(repoRoot, "src/auth/old-session.ts", "same content\n");
    await git(repoRoot, ["add", "src/auth/old-session.ts"]);
    await git(repoRoot, ["commit", "-m", "add protected file"]);

    await rename(
      join(repoRoot, "src", "auth", "old-session.ts"),
      join(repoRoot, "src", "auth", "new-session.ts")
    );
    await git(repoRoot, ["add", "-A"]);

    const result = await runCheck(repoRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("RepoBoundary blocked this commit.");
    expect(result.stderr).toContain("Action: rename");
    expect(result.stderr).toContain("src/auth/old-session.ts");
    expect(result.stderr).toContain("src/auth/new-session.ts");
  });
});

type CheckResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runCheck(cwd: string): Promise<CheckResult> {
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

  await program.parseAsync(["node", "repoboundary", "check"]);

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

async function writeRepoFile(
  repoRoot: string,
  path: string,
  contents: string
): Promise<void> {
  const filePath = join(repoRoot, path);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

function protectedConfig(): RepoBoundaryConfig {
  return {
    version: 1,
    rules: [
      {
        id: "auth-core",
        match: ["src/auth/**"],
        actions: ["create", "modify", "delete", "rename"],
        mode: "block",
        reason: "Sensitive authentication logic"
      }
    ]
  };
}
