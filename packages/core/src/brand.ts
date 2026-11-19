import { z } from "zod";
import { SterError } from "./errors.js";

/**
 * Build-time product branding (data-model.md `Brand`, FR-043).
 * Loaded by the host and passed into `createCore`; the core never reads app resources.
 */
export const brandSchema = z
  .object({
    productName: z.string().min(1),
    appId: z.string().min(1),
    dataDirName: z.string().min(1),
    policyDirName: z.string().min(1),
    icon: z.string().min(1),
    colors: z.record(z.string(), z.string()),
  })
  .strict();

export type Brand = z.infer<typeof brandSchema>;

/**
 * Parse and validate a brand document. Rejects unknown keys and empty required fields.
 */
export function parseBrand(input: unknown): Brand {
  const result = brandSchema.safeParse(input);
  if (!result.success) {
    throw new SterError("invalid-argument", "Brand document failed validation", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

/**
 * Load brand JSON text (for example the contents of `resources/brand.json`).
 */
export function loadBrandFromJson(text: string): Brand {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new SterError("invalid-argument", "Brand JSON is not valid JSON", {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
  return parseBrand(parsed);
}
