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
    model: z.string().min(1).max(128).optional(),
  })
  .strict();

export const modelIdSchema = z.string().min(1).max(128);

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

// High-level "generate a book" request from the renderer.
export const bookRequestSchema = z
  .object({
    topic: z.string().min(1).max(500),
    style: z.enum(['educational', 'casual', 'professional', 'creative']),
    length: z.enum(['short', 'medium', 'long']),
    providerId: providerIdSchema.optional(),
    model: z.string().min(1).max(128).optional(),
  })
  .strict();

export const bookIdSchema = z.string().uuid();

// ===== Workbench project schemas =====

export const projectIdSchema = z.string().uuid();
export const nodeIdSchema = z.string().uuid();

export const createProjectSchema = z
  .object({
    title: z.string().min(1).max(300),
    author: z.string().max(200).optional(),
    language: z.string().min(2).max(20).optional(),
    genre: z.string().max(100).optional(),
    topic: z.string().max(500).optional(),
    style: z.string().max(64).optional(),
    length: z.enum(['short', 'medium', 'long']).optional(),
    templateId: z.string().min(1).max(64).optional(),
  })
  .strict();

export const projectMetaSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    author: z.string().max(200).optional(),
    language: z.string().min(2).max(20).optional(),
    genre: z.string().max(100).optional(),
    description: z.string().max(5000).optional(),
    topic: z.string().max(500).optional(),
    style: z.string().max(64).optional(),
    length: z.enum(['short', 'medium', 'long']).optional(),
  })
  .strict();

export const nodeKindSchema = z.enum([
  'part',
  'chapter',
  'scene',
  'front-matter',
  'back-matter',
  'research',
]);

export const createNodeSchema = z
  .object({
    kind: nodeKindSchema,
    title: z.string().min(1).max(300),
    parentId: z.string().uuid().nullable().optional(),
    synopsis: z.string().max(5000).optional(),
    content: z.string().max(1_000_000).optional(),
  })
  .strict();

export const nodePatchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    synopsis: z.string().max(5000).optional(),
    content: z.string().max(1_000_000).optional(),
    kind: nodeKindSchema.optional(),
    keywords: z.array(z.string().max(64)).max(50).optional(),
  })
  .strict();

export const nodeMoveSchema = z
  .object({
    parentId: z.string().uuid().nullable(),
    order: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export const artworkIdSchema = z.string().uuid();

export const imageProviderConfigSchema = z
  .object({
    apiKey: z.string().min(1).max(512).optional(),
    bearerToken: z.string().min(1).max(512).optional(),
    baseUrl: z.string().url().max(2048).optional(),
    model: z.string().max(200).optional(),
    size: z.string().max(40).optional(),
    timeout: z.number().int().min(1000).max(300000).optional(),
    lora: z.string().max(300).optional(),
  })
  .strict();

export const artworkPlanSchema = z
  .object({
    stylePreset: z.string().min(1).max(64).optional(),
  })
  .strict();

export const artworkPatchSchema = z
  .object({
    prompt: z.string().max(4000).optional(),
    alt: z.string().max(500).optional(),
    caption: z.string().max(500).optional(),
    status: z.enum(['planned', 'disabled']).optional(),
  })
  .strict();

export const artworkGenerateAllSchema = z
  .object({
    maxImages: z.number().int().min(1).max(50).optional(),
    maxCostUsd: z.number().min(0).max(100).optional(),
  })
  .strict();

export const artworkUploadSchema = z
  .object({
    nodeId: z.string().uuid().nullable().optional(),
    placement: z
      .enum(['cover', 'frontispiece', 'chapter-opener', 'inline', 'full-page'])
      .optional(),
    alt: z.string().max(500).optional(),
  })
  .strict();

export const aiEditSchema = z
  .object({
    action: z.enum(['refine', 'expand', 'shorten', 'continue', 'regenerate']),
    instruction: z.string().max(2000).optional(),
  })
  .strict();

export const snapshotReasonSchema = z.enum([
  'manual',
  'pre-ai-edit',
  'pre-regenerate',
  'pre-restore',
]);

export const compileOptionsSchema = z
  .object({
    toc: z.boolean().optional(),
    frontMatter: z.boolean().optional(),
    backMatter: z.boolean().optional(),
    numbering: z.boolean().optional(),
    includeEmpty: z.boolean().optional(),
    title: z.string().min(1).max(300).optional(),
    author: z.string().max(200).optional(),
    language: z.string().min(2).max(20).optional(),
  })
  .strict();

export const compileRunSchema = z
  .object({
    projectId: projectIdSchema,
    format: z.enum(['markdown', 'html', 'pdf', 'docx', 'epub']),
    profileId: z.string().min(1).max(128).optional(),
    options: compileOptionsSchema.optional(),
  })
  .strict();

export const compileBatchSchema = z
  .object({
    projectIds: z.array(projectIdSchema).min(1).max(50),
    format: z.enum(['markdown', 'html', 'pdf', 'docx', 'epub']),
    options: compileOptionsSchema.optional(),
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
