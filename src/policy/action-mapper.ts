import type { BoundaryAction, BoundaryRule } from "../types/config.types.js";
import type { StagedFileChange } from "../types/git.types.js";

export function getChangeAction(change: StagedFileChange): BoundaryAction {
  return change.action;
}

export function isActionAllowedByRule(
  action: BoundaryAction,
  rule: BoundaryRule
): boolean {
  return rule.actions.includes(action);
}
