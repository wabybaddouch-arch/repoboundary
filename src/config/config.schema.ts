import { z } from "zod";
import { BOUNDARY_ACTIONS } from "./config.constants.js";
import type { RepoBoundaryConfig } from "../types/config.types.js";
import { RepoBoundaryError } from "../utils/errors.js";

export class ConfigValidationError extends RepoBoundaryError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export const boundaryActionSchema = z.enum(BOUNDARY_ACTIONS);

export const boundaryRuleSchema = z
  .object({
    id: z.string().trim().min(1, "Rule id cannot be empty."),
    match: z
      .array(z.string().trim().min(1, "Match pattern cannot be empty."))
      .min(1, "Rule match must include at least one pattern."),
    actions: z
      .array(boundaryActionSchema)
      .min(1, "Rule actions must include at least one action."),
    mode: z.literal("block"),
    reason: z.string().trim().min(1, "Rule reason cannot be empty.")
  })
  .strict();

export const repoBoundaryConfigSchema = z
  .object({
    version: z.literal(1),
    rules: z.array(boundaryRuleSchema)
  })
  .strict();

export function validateConfig(rawConfig: unknown): RepoBoundaryConfig {
  const result = repoBoundaryConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "config";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw new ConfigValidationError(`Invalid RepoBoundary config. ${details}`);
  }

  return result.data;
}
