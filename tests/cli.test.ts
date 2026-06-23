import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createCli, isDirectInvocation } from "../src/cli.js";

describe("CLI", () => {
  it("exposes help output and registered commands", () => {
    const help = createCli().helpInformation();

    expect(help).toContain("Usage: repoboundary");
    expect(help).toContain("Local CLI guardrails");
    expect(help).toContain("-V, --version");
    expect(help).toContain("-h, --help");
    expect(help).toContain("init");
    expect(help).toContain("check");
    expect(help).toContain("add");
    expect(help).toContain("remove");
    expect(help).toContain("status");
  });

  it("detects direct invocation through a symlink", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "repoboundary-cli-"));
    const realFile = join(tempRoot, "dist", "cli.js");
    const symlinkFile = join(tempRoot, "bin", "repoboundary");

    try {
      await mkdir(join(tempRoot, "dist"), { recursive: true });
      await mkdir(join(tempRoot, "bin"), { recursive: true });
      await writeFile(realFile, "#!/usr/bin/env node\n", "utf8");
      await symlink(realFile, symlinkFile);

      expect(isDirectInvocation(symlinkFile, pathToFileURL(realFile).href)).toBe(
        true
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
