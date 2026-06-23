import type { StagedFileChange } from "../types/git.types.js";
import { RepoBoundaryError } from "../utils/errors.js";
import { toPosixPath } from "../utils/paths.js";

export class GitStatusParseError extends RepoBoundaryError {
  constructor(message: string) {
    super(message);
    this.name = "GitStatusParseError";
  }
}

export function parseGitNameStatus(output: string): StagedFileChange[] {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map(parseGitNameStatusLine);
}

function parseGitNameStatusLine(line: string): StagedFileChange {
  const [status, ...paths] = line.split("\t");

  if (!status) {
    throw new GitStatusParseError("Git status line is missing a status code.");
  }

  if (status.startsWith("R")) {
    if (paths.length !== 2) {
      throw new GitStatusParseError(
        `Rename status requires old and new paths: ${line}`
      );
    }

    return {
      action: "rename",
      oldPath: toPosixPath(paths[0] ?? ""),
      newPath: toPosixPath(paths[1] ?? "")
    };
  }

  if (paths.length !== 1) {
    throw new GitStatusParseError(
      `Git status requires exactly one path for ${status}: ${line}`
    );
  }

  const path = toPosixPath(paths[0] ?? "");

  switch (status) {
    case "A":
      return { action: "create", path };
    case "M":
      return { action: "modify", path };
    case "D":
      return { action: "delete", path };
    default:
      throw new GitStatusParseError(
        `Unsupported Git status "${status}". Phase 2 supports A, M, D, and R*.`
      );
  }
}
