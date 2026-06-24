/**
 * Zod schemas validating every payload that crosses the IPC boundary.
 *
 * The renderer is untrusted from the main process's point of view, so each
 * handler parses its arguments through one of these schemas before acting on
 * them. `.strict()` rejects unexpected keys rather than silently passing them
 * through to provider clients.
 */

import { z } from 'zod';

export const providerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_-]+$/, 'Provider id must be lowercase alphanumeric/dash/underscore');

export const providerConfigSchema = z
  .object({
    apiKey: z.string().min(1).max(512).optional(),
    endpoint: z.string().url().max(2048).optional(),
    organizationId: z.string().max(128).optional(),
    customHeaders: z.record(z.string(), z.string()).optional(),
    timeout: z.number().int().min(1000).max(300000).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    bearerToken: z.string().min(1).max(512).optional(),
  })
  .strict();

const messageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(100000),
    name: z.string().max(128).optional(),
  })
  .strict();

export const generationParamsSchema = z
  .object({
    providerId: providerIdSchema.optional(),
    model: z.string().min(1).max(128),
    messages: z.array(messageSchema).min(1).max(200),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(200000).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(0).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    stop: z.array(z.string().max(256)).max(8).optional(),
    systemPrompt: z.string().max(100000).optional(),
  })
  .strict();

// Keys for the generic, non-secret app-config store. Restricted to a known
// character set; provider credentials are intentionally NOT reachable here.
export const appConfigKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid config key');

// App config values must be JSON-serialisable; cap the size to avoid abuse.
export const appConfigValueSchema = z
  .unknown()
  .refine((v) => {
    try {
      return JSON.stringify(v).length <= 100000;
    } catch {
      return false;
    }
  }, 'Config value must be JSON-serialisable and under 100KB');

export type ProviderConfigInput = z.infer<typeof providerConfigSchema>;
export type GenerationParamsInput = z.infer<typeof generationParamsSchema>;
