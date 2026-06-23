import { readFile, writeFile } from "node:fs/promises";
import { RepoBoundaryError } from "./errors.js";

export async function readJsonFile(filePath: string): Promise<unknown> {
  let contents: string;

  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    throw new RepoBoundaryError(
      `Could not read JSON file at ${filePath}: ${getErrorMessage(error)}`
    );
  }

  try {
    return JSON.parse(contents) as unknown;
  } catch (error) {
    throw new RepoBoundaryError(
      `Invalid JSON in ${filePath}: ${getErrorMessage(error)}`
    );
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
  options?: { overwrite?: boolean }
): Promise<void> {
  const overwrite = options?.overwrite ?? true;
  const flag = overwrite ? "w" : "wx";
  const contents = `${JSON.stringify(value, null, 2)}\n`;

  try {
    await writeFile(filePath, contents, { encoding: "utf8", flag });
  } catch (error) {
    throw new RepoBoundaryError(
      `Could not write JSON file at ${filePath}: ${getErrorMessage(error)}`
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
