import type { RepoBoundaryConfig } from "../types/config.types.js";

export const CONFIG_FILE_NAME = ".repoboundary.json";

export const BOUNDARY_ACTIONS = [
  "create",
  "modify",
  "delete",
  "rename"
] as const;

export const DEFAULT_CONFIG: RepoBoundaryConfig = {
  version: 1,
  rules: []
};
