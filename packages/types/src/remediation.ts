import { z } from 'zod';
import { AwsServiceSchema, ResourceRefSchema } from './aws.js';

/** The kind of remediation artifact produced by a generator. */
export const RemediationKindSchema = z.enum(['terraform', 'aws-cli']);
export type RemediationKind = z.infer<typeof RemediationKindSchema>;

/** A rendered, resource-specific remediation artifact (Terraform or AWS CLI). */
export const GeneratedRemediationSchema = z.object({
  findingId: z.string().min(1),
  catalogId: z.string().min(1),
  kind: RemediationKindSchema,
  /** The rendered HCL or shell content, ready to run/apply. */
  content: z.string().min(1),
  summary: z.string().min(1),
  resource: ResourceRefSchema,
  generatedAt: z.string().datetime(),
});
export type GeneratedRemediation = z.infer<typeof GeneratedRemediationSchema>;

/**
 * A logical write action the aws-tools layer knows how to execute to fix a
 * finding. This is the ONLY channel through which state changes happen.
 */
export const RemediationActionSchema = z.object({
  findingId: z.string().min(1),
  catalogId: z.string().min(1),
  description: z.string().min(1),
  service: AwsServiceSchema,
  /** Logical operation name understood by the aws-tools remediation layer. */
  operation: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type RemediationAction = z.infer<typeof RemediationActionSchema>;

/** The outcome of executing a single remediation action. */
export const RemediationResultSchema = z.object({
  findingId: z.string().min(1),
  catalogId: z.string().min(1),
  success: z.boolean(),
  message: z.string(),
  executedAt: z.string().datetime(),
});
export type RemediationResult = z.infer<typeof RemediationResultSchema>;
