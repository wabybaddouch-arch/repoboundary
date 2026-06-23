import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { runCommand } from "../utils/exec.js";

export const REPOBOUNDARY_HOOK_START_MARKER = "# >>> repoboundary >>>";
export const REPOBOUNDARY_HOOK_END_MARKER = "# <<< repoboundary <<<";

export const REPOBOUNDARY_PRE_COMMIT_BLOCK = createRepoBoundaryPreCommitBlock();

export function createRepoBoundaryPreCommitBlock(
  checkCommand?: string
): string {
  const commandLines = checkCommand
    ? [checkCommand]
    : [
        "if command -v repoboundary >/dev/null 2>&1; then",
        "  repoboundary check",
        "else",
        "  npx --no-install repoboundary check",
        "fi"
      ];

  return [
    REPOBOUNDARY_HOOK_START_MARKER,
    "# RepoBoundary protected-file check",
    ...commandLines,
    "repoboundary_status=$?",
    "if [ \"$repoboundary_status\" -ne 0 ]; then",
    "  exit \"$repoboundary_status\"",
    "fi",
    REPOBOUNDARY_HOOK_END_MARKER
  ].join("\n");
}

export type HookInstallResult = {
  hookPath: string;
};

export type HookStatus = {
  hookPath: string;
  installed: boolean;
};

export async function getPreCommitHookPath(repoRoot: string): Promise<string> {
  const result = await runCommand(
    "git",
    ["rev-parse", "--git-path", "hooks/pre-commit"],
    {
      cwd: repoRoot
    }
  );

  const hookPath = result.stdout.trim();
  return isAbsolute(hookPath) ? hookPath : join(repoRoot, hookPath);
}

export async function installOrUpdatePreCommitHook(
  repoRoot: string,
  checkCommand?: string
): Promise<HookInstallResult> {
  const hookPath = await getPreCommitHookPath(repoRoot);
  const currentHook = await readHookIfExists(hookPath);
  const updatedHook = upsertRepoBoundaryBlock(currentHook, checkCommand);

  await mkdir(dirname(hookPath), { recursive: true });
  await writeFile(hookPath, updatedHook, "utf8");
  await makeExecutableWhereSupported(hookPath);

  return { hookPath };
}

export async function getPreCommitHookStatus(
  repoRoot: string
): Promise<HookStatus> {
  const hookPath = await getPreCommitHookPath(repoRoot);
  const currentHook = await readHookIfExists(hookPath);

  return {
    hookPath,
    installed: hasRepoBoundaryBlock(currentHook ?? "")
  };
}

export function upsertRepoBoundaryBlock(
  currentHook: string | undefined,
  checkCommand?: string
): string {
  const existing = currentHook ?? "";
  const withoutManagedBlock = removeManagedBlock(existing);

  return prependManagedBlock(withoutManagedBlock, checkCommand);
}

function hasRepoBoundaryBlock(currentHook: string): boolean {
  return (
    currentHook.includes(REPOBOUNDARY_HOOK_START_MARKER) &&
    currentHook.includes(REPOBOUNDARY_HOOK_END_MARKER)
  );
}

async function readHookIfExists(hookPath: string): Promise<string | undefined> {
  try {
    return await readFile(hookPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function removeManagedBlock(currentHook: string): string {
  const startIndex = currentHook.indexOf(REPOBOUNDARY_HOOK_START_MARKER);

  if (startIndex === -1) {
    return currentHook;
  }

  const endIndex = currentHook.indexOf(
    REPOBOUNDARY_HOOK_END_MARKER,
    startIndex
  );

  if (endIndex === -1) {
    return currentHook.slice(0, startIndex);
  }

  const afterEndIndex = endIndex + REPOBOUNDARY_HOOK_END_MARKER.length;
  return `${currentHook.slice(0, startIndex)}${currentHook.slice(afterEndIndex)}`;
}

function prependManagedBlock(currentHook: string, checkCommand?: string): string {
  const managedBlock = createRepoBoundaryPreCommitBlock(checkCommand);

  if (currentHook.length === 0) {
    return `#!/bin/sh\n\n${managedBlock}\n`;
  }

  const { shebang, body } = splitShebang(currentHook);
  const normalizedBody = body.replace(/^(?:\r?\n)+/u, "");
  const bodySection =
    normalizedBody.length > 0 ? `\n${ensureTrailingNewline(normalizedBody)}` : "";

  return `${shebang}\n\n${managedBlock}\n${bodySection}`;
}

function splitShebang(currentHook: string): { shebang: string; body: string } {
  if (!currentHook.startsWith("#!")) {
    return {
      shebang: "#!/bin/sh",
      body: currentHook
    };
  }

  const newlineIndex = currentHook.indexOf("\n");

  if (newlineIndex === -1) {
    return {
      shebang: currentHook.replace(/\r$/u, ""),
      body: ""
    };
  }

  return {
    shebang: currentHook.slice(0, newlineIndex).replace(/\r$/u, ""),
    body: currentHook.slice(newlineIndex + 1)
  };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

async function makeExecutableWhereSupported(hookPath: string): Promise<void> {
  const currentMode = (await stat(hookPath)).mode;
  await chmod(hookPath, currentMode | 0o111);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
