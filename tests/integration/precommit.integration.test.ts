import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME } from "../../src/config/config.constants.js";
import {
  REPOBOUNDARY_HOOK_END_MARKER,
  REPOBOUNDARY_HOOK_START_MARKER
} from "../../src/git/hook-manager.js";

const testFilePath = fileURLToPath(import.meta.url);
const workspaceRoot = resolve(dirname(testFilePath), "../..");
const cliEntry = join(workspaceRoot, "dist", "cli.js");
let commandEnv: NodeJS.ProcessEnv;

describe("repoboundary pre-commit hook", () => {
  let repoRoot: string;

  beforeAll(async () => {
    await runProcess("npm", ["run", "build"], {
      cwd: workspaceRoot,
      env: process.env
    });
  });

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "repoboundary-precommit-"));
    const binDir = await createRepoBoundaryShim(repoRoot);
    commandEnv = createCommandEnv(binDir);
    await initRepo(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("blocks a commit that stages a protected file", async () => {
    await repoboundary(repoRoot, ["init"]);
    await repoboundary(repoRoot, [
      "add",
      "src/auth/**",
      "--reason",
      "Sensitive authentication logic"
    ]);
    await mkdir(join(repoRoot, "src", "auth"), { recursive: true });
    await writeFile(
      join(repoRoot, "src", "auth", "session.ts"),
      "export {};\n",
      "utf8"
    );
    await git(repoRoot, ["add", "src/auth/session.ts"]);

    const result = await git(repoRoot, ["commit", "-m", "add protected file"], {
      rejectOnNonZero: false
    });
    const output = combinedOutput(result);

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain("RepoBoundary blocked this commit.");
    expect(output).toContain("Protected files were changed:");
    expect(output).toContain("src/auth/session.ts");
    expect(output).toContain("Action: create");
    expect(output).toContain("Rule: src-auth");
    expect(output).toContain("Reason: Sensitive authentication logic");
  });

  it("allows a commit that only stages unprotected files", async () => {
    await repoboundary(repoRoot, ["init"]);
    await repoboundary(repoRoot, [
      "add",
      "src/auth/**",
      "--reason",
      "Sensitive authentication logic"
    ]);
    await mkdir(join(repoRoot, "src", "ui"), { recursive: true });
    await writeFile(join(repoRoot, "src", "ui", "button.ts"), "export {};\n", "utf8");
    await git(repoRoot, ["add", "src/ui/button.ts"]);

    const result = await git(repoRoot, ["commit", "-m", "add unprotected file"], {
      rejectOnNonZero: false
    });
    const commitCount = await git(repoRoot, ["rev-list", "--count", "HEAD"]);

    expect(result.exitCode).toBe(0);
    expect(combinedOutput(result)).not.toContain(
      "RepoBoundary blocked this commit."
    );
    expect(commitCount.stdout.trim()).toBe("1");
  });

  it("blocks a commit that renames a protected file", async () => {
    await repoboundary(repoRoot, ["init"]);
    await mkdir(join(repoRoot, "src", "auth"), { recursive: true });
    await writeFile(join(repoRoot, "src", "auth", "old.ts"), "export {};\n", "utf8");
    await git(repoRoot, ["add", "src/auth/old.ts"]);
    await git(repoRoot, ["commit", "-m", "seed protected file"]);
    await repoboundary(repoRoot, [
      "add",
      "src/auth/**",
      "--reason",
      "Sensitive authentication logic"
    ]);
    await git(repoRoot, ["mv", "src/auth/old.ts", "src/auth/new.ts"]);

    const result = await git(repoRoot, ["commit", "-m", "rename protected file"], {
      rejectOnNonZero: false
    });
    const output = combinedOutput(result);

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain("RepoBoundary blocked this commit.");
    expect(output).toContain("src/auth/old.ts");
    expect(output).toContain("src/auth/new.ts");
    expect(output).toContain("Action: rename");
    expect(output).toContain("Rule: src-auth");
  });

  it("blocks commits when the config is invalid", async () => {
    await repoboundary(repoRoot, ["init"]);
    await writeFile(
      join(repoRoot, CONFIG_FILE_NAME),
      `${JSON.stringify({ version: 2, rules: [] }, null, 2)}\n`,
      "utf8"
    );
    await writeFile(join(repoRoot, "notes.txt"), "hello\n", "utf8");
    await git(repoRoot, ["add", "notes.txt"]);

    const result = await git(repoRoot, ["commit", "-m", "add notes"], {
      rejectOnNonZero: false
    });
    const output = combinedOutput(result);

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain("RepoBoundary could not read a valid config.");
    expect(output).toContain("version");
  });

  it("preserves existing hooks and keeps them executable", async () => {
    const hookPath = preCommitHookPath(repoRoot);
    await writeFile(
      hookPath,
      ["#!/bin/sh", "echo existing hook ran", ""].join("\n"),
      "utf8"
    );
    await chmod(hookPath, 0o755);

    await repoboundary(repoRoot, ["init"]);
    const hook = await readFile(hookPath, "utf8");
    const hookStats = await stat(hookPath);
    await writeFile(join(repoRoot, "notes.txt"), "hello\n", "utf8");
    await git(repoRoot, ["add", "notes.txt"]);

    const result = await git(repoRoot, ["commit", "-m", "run preserved hook"], {
      rejectOnNonZero: false
    });

    expect(hook).toContain("echo existing hook ran");
    expect(hook).toContain(REPOBOUNDARY_HOOK_START_MARKER);
    expect(hook).toContain(REPOBOUNDARY_HOOK_END_MARKER);
    expect(hookStats.mode & 0o111).not.toBe(0);
    expect(result.exitCode).toBe(0);
    expect(combinedOutput(result)).toContain("existing hook ran");
  });

  it("runs before an existing hook with an early exit", async () => {
    const hookPath = preCommitHookPath(repoRoot);
    await writeFile(hookPath, ["#!/bin/sh", "exit 0", ""].join("\n"), "utf8");
    await chmod(hookPath, 0o755);

    await repoboundary(repoRoot, ["init"]);
    const hook = await readFile(hookPath, "utf8");
    await repoboundary(repoRoot, [
      "add",
      "src/auth/**",
      "--reason",
      "Sensitive authentication logic"
    ]);
    await mkdir(join(repoRoot, "src", "auth"), { recursive: true });
    await writeFile(
      join(repoRoot, "src", "auth", "session.ts"),
      "export {};\n",
      "utf8"
    );
    await git(repoRoot, ["add", "src/auth/session.ts"]);

    const result = await git(repoRoot, ["commit", "-m", "add protected file"], {
      rejectOnNonZero: false
    });
    const output = combinedOutput(result);

    expect(hook.indexOf(REPOBOUNDARY_HOOK_START_MARKER)).toBeLessThan(
      hook.indexOf("exit 0")
    );
    expect(result.exitCode).not.toBe(0);
    expect(output).toContain("RepoBoundary blocked this commit.");
    expect(output).toContain("src/auth/session.ts");
  });
});

type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type ProcessOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  rejectOnNonZero?: boolean;
};

async function createRepoBoundaryShim(repoRoot: string): Promise<string> {
  const binDir = join(repoRoot, "bin");
  const shimPath = join(binDir, "repoboundary");
  await mkdir(binDir, { recursive: true });
  await writeFile(
      shimPath,
      [
        "#!/bin/sh",
        `exec node ${shellQuote(cliEntry)} "$@"`,
        ""
      ].join("\n"),
      "utf8"
  );
  await chmod(shimPath, 0o755);
  return binDir;
}

function createCommandEnv(binDir: string): NodeJS.ProcessEnv {
  return {
    PATH: [binDir, process.env.PATH].filter(Boolean).join(delimiter),
    HOME: process.env.HOME,
    LANG: process.env.LANG,
    SHELL: process.env.SHELL,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER
  };
}

async function initRepo(repoRoot: string): Promise<void> {
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "repoboundary@example.test"]);
  await git(repoRoot, ["config", "user.name", "RepoBoundary Tests"]);
}

async function repoboundary(
  repoRoot: string,
  args: readonly string[],
  options: { rejectOnNonZero?: boolean } = {}
): Promise<ProcessResult> {
  return runProcess("repoboundary", args, {
    cwd: repoRoot,
    env: commandEnv,
    rejectOnNonZero: options.rejectOnNonZero
  });
}

async function git(
  repoRoot: string,
  args: readonly string[],
  options: { rejectOnNonZero?: boolean } = {}
): Promise<ProcessResult> {
  return runProcess("git", args, {
    cwd: repoRoot,
    env: commandEnv,
    rejectOnNonZero: options.rejectOnNonZero
  });
}

function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessOptions
): Promise<ProcessResult> {
  const rejectOnNonZero = options.rejectOnNonZero ?? true;

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);

    child.on("close", (code) => {
      const exitCode = code ?? 1;
      const result = { exitCode, stdout, stderr };

      if (rejectOnNonZero && exitCode !== 0) {
        reject(
          new Error(
            `${formatCommand(command, args)} failed with exit code ${exitCode}: ${combinedOutput(
              result
            ).trim()}`
          )
        );
        return;
      }

      resolvePromise(result);
    });
  });
}

function preCommitHookPath(repoRoot: string): string {
  return join(repoRoot, ".git", "hooks", "pre-commit");
}

function combinedOutput(result: ProcessResult): string {
  return `${result.stdout}${result.stderr}`;
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
