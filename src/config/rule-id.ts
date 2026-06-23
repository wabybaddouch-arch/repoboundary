import type { RepoBoundaryConfig } from "../types/config.types.js";

export function generateRuleId(
  pattern: string,
  existingIds: Iterable<string> = []
): string {
  const baseId = toRuleIdBase(pattern);
  const usedIds = new Set(existingIds);

  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;

  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }

  return candidate;
}

export function findDuplicatePatterns(
  config: RepoBoundaryConfig,
  patterns: string[]
): string[] {
  const existingPatterns = new Set(
    config.rules.flatMap((rule) => rule.match.map(normalizePatternForCompare))
  );

  return patterns.filter((pattern, index) => {
    const normalizedPattern = normalizePatternForCompare(pattern);
    const appearsEarlier =
      patterns.findIndex(
        (candidate) =>
          normalizePatternForCompare(candidate) === normalizedPattern
      ) !== index;

    return appearsEarlier || existingPatterns.has(normalizedPattern);
  });
}

function toRuleIdBase(pattern: string): string {
  const normalized = pattern
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.[^/.]+$/u, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "rule";
}

function normalizePatternForCompare(pattern: string): string {
  return pattern.trim().replace(/\\/g, "/");
}
