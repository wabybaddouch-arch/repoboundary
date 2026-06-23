import { getChangeAction, isActionAllowedByRule } from "./action-mapper.js";
import { matchesAnyPattern } from "./matcher.js";
import type { RepoBoundaryConfig } from "../types/config.types.js";
import type { StagedFileChange } from "../types/git.types.js";
import type {
  PolicyEvaluationResult,
  PolicyViolation
} from "../types/policy.types.js";

export function evaluatePolicy(
  config: RepoBoundaryConfig,
  stagedChanges: readonly StagedFileChange[]
): PolicyEvaluationResult {
  const violations: PolicyViolation[] = [];

  for (const change of stagedChanges) {
    for (const rule of config.rules) {
      const action = getChangeAction(change);

      if (rule.mode !== "block" || !isActionAllowedByRule(action, rule)) {
        continue;
      }

      const matches = getMatchingPaths(change, rule.match);

      for (const match of matches) {
        violations.push({
          ruleId: rule.id,
          action,
          matchedPath: match.path,
          matchedPattern: match.pattern,
          reason: rule.reason,
          change
        });
      }
    }
  }

  return { violations };
}

function getMatchingPaths(
  change: StagedFileChange,
  patterns: readonly string[]
): Array<{ path: string; pattern: string }> {
  if (change.action === "rename") {
    return [change.oldPath, change.newPath].flatMap((path) => {
      const pattern = matchesAnyPattern(path, patterns);
      return pattern ? [{ path, pattern }] : [];
    });
  }

  const pattern = matchesAnyPattern(change.path, patterns);
  return pattern ? [{ path: change.path, pattern }] : [];
}
