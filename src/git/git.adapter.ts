import { parseGitNameStatus } from "./git-status.parser.js";
import type { StagedFileChange } from "../types/git.types.js";
import { runCommand } from "../utils/exec.js";
import { toPosixPath } from "../utils/paths.js";

export async function isInsideGitRepo(cwd: string): Promise<boolean> {
  const result = await runCommand(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    {
      cwd,
      rejectOnNonZero: false
    }
  );

  return result.exitCode === 0 && result.stdout.trim() === "true";
}

export async function getRepoRoot(cwd: string): Promise<string> {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd
  });

  return toPosixPath(result.stdout.trim());
}

export async function getStagedChanges(
  repoRoot: string
): Promise<StagedFileChange[]> {
  const result = await runCommand(
    "git",
    ["diff", "--cached", "--name-status", "-z"],
    {
      cwd: repoRoot
    }
  );

  return parseGitNameStatus(result.stdout);
}
