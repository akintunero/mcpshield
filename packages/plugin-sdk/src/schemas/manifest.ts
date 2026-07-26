import { z } from 'zod';

export const PluginManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Plugin ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  apiVersion: z.enum(['v1']).default('v1'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver'),
  category: z.string().default('uncategorized'),
  description: z.string().default(''),
  author: z.string().default(''),
  homepage: z.string().url().optional(),
  repository: z.string().optional(),
  license: z.string().default('MIT'),
  capabilities: z.array(z.string()).default([]),
  entrypoint: z.string().default('./dist/index.js'),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
