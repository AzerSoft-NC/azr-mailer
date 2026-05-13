import { z } from "zod";

const emailSchema = z.string().trim().email().max(320);

const toSchema = z.union([
  emailSchema,
  z.array(emailSchema).nonempty().max(50),
]);

const metaSchema = z.record(z.string(), z.unknown()).optional();

export const sendV1Schema = z
  .object({
    appId: z.string().trim().min(1).max(128),
    from: emailSchema,
    to: toSchema,
    subject: z.string().trim().min(1).max(998),
    html: z.string().min(1).max(1_500_000),
    replyTo: emailSchema.optional(),
    meta: metaSchema,
    /** Optional client timestamp (ms since epoch) for skew window checks */
    clientTs: z.number().finite().optional(),
  })
  .strict();

/** Legacy /send contract (no appId) */
export const sendLegacySchema = z
  .object({
    from: emailSchema,
    to: toSchema,
    subject: z.string().trim().min(1).max(998),
    html: z.string().min(1).max(1_500_000),
  })
  .strict();

/**
 * @param {unknown} err
 */
export function formatZodError(err) {
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    const path = first?.path?.length ? first.path.join(".") : "body";
    return `${path}: ${first?.message || "invalid"}`;
  }
  return "invalid_payload";
}
