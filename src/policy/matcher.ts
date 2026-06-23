import picomatch from "picomatch";

export function matchesAnyPattern(
  path: string,
  patterns: readonly string[]
): string | undefined {
  return patterns.find((pattern) =>
    picomatch.isMatch(path, pattern, {
      dot: true,
      posixSlashes: true
    })
  );
}
