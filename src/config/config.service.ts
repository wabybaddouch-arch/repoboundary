import { access } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_FILE_NAME, DEFAULT_CONFIG } from "./config.constants.js";
import { validateConfig } from "./config.schema.js";
import type { RepoBoundaryConfig } from "../types/config.types.js";
import { readJsonFile, writeJsonFile } from "../utils/json.js";

export function getConfigPath(repoRoot: string): string {
  return join(repoRoot, CONFIG_FILE_NAME);
}

export async function loadConfig(repoRoot: string): Promise<RepoBoundaryConfig> {
  const rawConfig = await readJsonFile(getConfigPath(repoRoot));
  return validateConfig(rawConfig);
}

export async function writeConfig(
  repoRoot: string,
  config: RepoBoundaryConfig
): Promise<void> {
  const validatedConfig = validateConfig(config);
  await writeJsonFile(getConfigPath(repoRoot), validatedConfig);
}

export async function createDefaultConfig(
  repoRoot: string
): Promise<RepoBoundaryConfig> {
  await writeJsonFile(getConfigPath(repoRoot), DEFAULT_CONFIG, {
    overwrite: false
  });

  return DEFAULT_CONFIG;
}

export async function configExists(repoRoot: string): Promise<boolean> {
  try {
    await access(getConfigPath(repoRoot));
    return true;
  } catch {
    return false;
  }
}
