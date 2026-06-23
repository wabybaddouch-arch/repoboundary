import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getRepoRoot,
  getStagedChanges,
  isInsideGitRepo
} from "../../src/git/git.adapter.js";
import { runCommand } from "../../src/utils/exec.js";

describe("git adapter", () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "repoboundary-git-"));
    await initRepo(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("detects whether a directory is inside a Git repository", async () => {
    const nestedDir = join(repoRoot, "src", "nested");
    await mkdir(nestedDir, { recursive: true });

    await expect(isInsideGitRepo(repoRoot)).resolves.toBe(true);
    await expect(isInsideGitRepo(nestedDir)).resolves.toBe(true);
    await expect(isInsideGitRepo(tmpdir())).resolves.toBe(false);
  });

  it("resolves the repository root from a nested directory", async () => {
    const nestedDir = join(repoRoot, "src", "nested");
    await mkdir(nestedDir, { recursive: true });

    await expect(getRepoRoot(nestedDir)).resolves.toBe(repoRoot);
  });

  it("detects a staged created file", async () => {
    await writeFile(join(repoRoot, "created.ts"), "export const value = 1;\n");
    await git(repoRoot, ["add", "created.ts"]);

    await expect(getStagedChanges(repoRoot)).resolves.toEqual([
      { action: "create", path: "created.ts" }
    ]);
  });

  it("detects a staged modified file", async () => {
    await writeFile(join(repoRoot, "tracked.ts"), "before\n");
    await git(repoRoot, ["add", "tracked.ts"]);
    await git(repoRoot, ["commit", "-m", "add tracked file"]);

    await writeFile(join(repoRoot, "tracked.ts"), "after\n");
    await git(repoRoot, ["add", "tracked.ts"]);

    await expect(getStagedChanges(repoRoot)).resolves.toEqual([
      { action: "modify", path: "tracked.ts" }
    ]);
  });

  it("detects a staged deleted file", async () => {
    await writeFile(join(repoRoot, "deleted.ts"), "delete me\n");
    await git(repoRoot, ["add", "deleted.ts"]);
    await git(repoRoot, ["commit", "-m", "add deleted file"]);

    await rm(join(repoRoot, "deleted.ts"));
    await git(repoRoot, ["add", "deleted.ts"]);

    await expect(getStagedChanges(repoRoot)).resolves.toEqual([
      { action: "delete", path: "deleted.ts" }
    ]);
  });

  it("detects a staged renamed file", async () => {
    await writeFile(join(repoRoot, "old-name.ts"), "same content\n");
    await git(repoRoot, ["add", "old-name.ts"]);
    await git(repoRoot, ["commit", "-m", "add renamed file"]);

    await rename(join(repoRoot, "old-name.ts"), join(repoRoot, "new-name.ts"));
    await git(repoRoot, ["add", "-A"]);

    await expect(getStagedChanges(repoRoot)).resolves.toEqual([
      {
        action: "rename",
        oldPath: "old-name.ts",
        newPath: "new-name.ts"
      }
    ]);
  });
});

async function initRepo(repoRoot: string): Promise<void> {
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "repoboundary@example.test"]);
  await git(repoRoot, ["config", "user.name", "RepoBoundary Tests"]);
}

async function git(repoRoot: string, args: readonly string[]): Promise<void> {
  await runCommand("git", args, { cwd: repoRoot });
}
