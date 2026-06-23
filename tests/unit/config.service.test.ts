import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME } from "../../src/config/config.constants.js";
import {
  createDefaultConfig,
  loadConfig,
  writeConfig
} from "../../src/config/config.service.js";

describe("config service", () => {
  it("creates the default config", async () => {
    const repoRoot = await createTempDir();

    await expect(createDefaultConfig(repoRoot)).resolves.toEqual({
      version: 1,
      rules: []
    });

    await expect(loadConfig(repoRoot)).resolves.toEqual({
      version: 1,
      rules: []
    });
  });

  it("writes and loads a valid config", async () => {
    const repoRoot = await createTempDir();
    const config = {
      version: 1 as const,
      rules: [
        {
          id: "database-schema",
          match: ["prisma/schema.prisma"],
          actions: ["modify" as const],
          mode: "block" as const,
          reason: "Database schema changes require review"
        }
      ]
    };

    await writeConfig(repoRoot, config);

    await expect(loadConfig(repoRoot)).resolves.toEqual(config);
    await expect(
      readFile(join(repoRoot, CONFIG_FILE_NAME), "utf8")
    ).resolves.toContain('"version": 1');
  });

  it("does not overwrite an existing config when creating the default", async () => {
    const repoRoot = await createTempDir();

    await createDefaultConfig(repoRoot);

    await expect(createDefaultConfig(repoRoot)).rejects.toThrow(
      /Could not write JSON file/
    );
  });
});

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "repoboundary-config-"));
}
