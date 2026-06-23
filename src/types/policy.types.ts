import type { BoundaryAction, BoundaryRule } from "./config.types.js";
import type { StagedFileChange } from "./git.types.js";

export type PolicyViolation = {
  ruleId: BoundaryRule["id"];
  action: BoundaryAction;
  matchedPath: string;
  matchedPattern: string;
  reason: BoundaryRule["reason"];
  change: StagedFileChange;
};

export type PolicyEvaluationResult = {
  violations: PolicyViolation[];
};
