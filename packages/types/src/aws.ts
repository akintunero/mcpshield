import { z } from 'zod';

/** AWS services covered by the MCPShield scanners and provisioning. */
export const AwsServiceSchema = z.enum([
  's3',
  'iam',
  'lambda',
  'sqs',
  'sns',
  'secretsmanager',
  'ssm',
  'dynamodb',
  'cloudwatch',
  'cloudtrail',
  'ec2',
]);
export type AwsService = z.infer<typeof AwsServiceSchema>;

/** A reference to a concrete AWS resource. */
export const ResourceRefSchema = z.object({
  service: AwsServiceSchema,
  /** Logical resource type, e.g. "bucket", "user", "access-key", "security-group". */
  type: z.string(),
  /** Primary identifier (bucket name, user name, key id, ...). */
  id: z.string(),
  arn: z.string().optional(),
  region: z.string().optional(),
});
export type ResourceRef = z.infer<typeof ResourceRefSchema>;
