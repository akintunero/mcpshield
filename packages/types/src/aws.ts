import { z } from 'zod';

/** Supported cloud providers. Add new providers here and implement CloudProvider. */
export const ProviderSchema = z.enum(['aws', 'azure', 'gcp', 'k8s']);
export type Provider = z.infer<typeof ProviderSchema>;

/** AWS-specific services. Kept for backward compat — new code should use generic strings. */
export const AwsServiceSchema = z.enum([
  's3', 'iam', 'lambda', 'sqs', 'sns', 'secretsmanager',
  'ssm', 'dynamodb', 'cloudwatch', 'cloudtrail', 'ec2', 'kms',
]);
export type AwsService = z.infer<typeof AwsServiceSchema>;

/**
 * A reference to a concrete resource across any cloud provider.
 * Backward-compatible: if provider is omitted, 'aws' is assumed.
 */
export const ResourceRefSchema = z.object({
  /** Cloud provider: 'aws' (default), 'azure', 'gcp', 'k8s'. */
  provider: ProviderSchema.default('aws'),
  /** Provider-specific service name, e.g. "s3", "blob", "gcs", "virtualmachine". */
  service: z.string(),
  /** Logical resource type, e.g. "bucket", "user", "security-group", "namespace". */
  type: z.string(),
  /** Primary identifier (bucket name, user name, key id, ...). */
  id: z.string(),
  /** Provider-specific native reference (AWS ARN, Azure resource ID, etc.). */
  nativeRef: z.string().optional(),
  /** Deprecated: use nativeRef. Kept for backward compatibility. */
  arn: z.string().optional(),
  /** Geographic or deployment location (AWS region, Azure region, GCP zone, K8s cluster). */
  location: z.string().optional(),
  /** Deprecated: use location. Kept for backward compatibility. */
  region: z.string().optional(),
});
export type ResourceRef = z.infer<typeof ResourceRefSchema>;
