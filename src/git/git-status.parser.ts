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
  if (output.length === 0) {
    return [];
  }

  const fields = output.split("\0");

  if (fields.at(-1) !== "") {
    throw new GitStatusParseError(
      "Git status output is not NUL-terminated."
    );
  }

  fields.pop();
  const changes: StagedFileChange[] = [];

  for (let index = 0; index < fields.length; ) {
    const status = fields[index];

    if (!status) {
      throw new GitStatusParseError("Git status entry is missing a status code.");
    }

    index += 1;

    if (status.startsWith("R")) {
      const oldPath = fields[index];
      const newPath = fields[index + 1];

      if (!oldPath || !newPath) {
        throw new GitStatusParseError(
          `Rename status requires old and new paths: ${status}`
        );
      }

      changes.push({
        action: "rename",
        oldPath: toPosixPath(oldPath),
        newPath: toPosixPath(newPath)
      });
      index += 2;
      continue;
    }

    const path = fields[index];

    if (!path) {
      throw new GitStatusParseError(`Git status requires a path for ${status}.`);
    }

    index += 1;
    const normalizedPath = toPosixPath(path);

    switch (status) {
      case "A":
        changes.push({ action: "create", path: normalizedPath });
        break;
      case "M":
        changes.push({ action: "modify", path: normalizedPath });
        break;
      case "D":
        changes.push({ action: "delete", path: normalizedPath });
        break;
      default:
        throw new GitStatusParseError(
          `Unsupported Git status "${status}". Phase 2 supports A, M, D, and R*.`
        );
    }
  }

  return changes;
}
