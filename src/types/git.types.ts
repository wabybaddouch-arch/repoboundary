import type { BoundaryAction } from "./config.types.js";

export type GitChangeAction = BoundaryAction;

export type StagedFileChange =
  | {
      action: Exclude<GitChangeAction, "rename">;
      path: string;
    }
  | {
      action: "rename";
      oldPath: string;
      newPath: string;
    };
