import {
  ListBucketsCommand,
  GetPublicAccessBlockCommand,
  GetBucketAclCommand,
  GetBucketPolicyCommand,
  GetBucketEncryptionCommand,
  GetBucketVersioningCommand,
  GetBucketLoggingCommand,
  GetBucketTaggingCommand,
} from '@aws-sdk/client-s3';
import {
  ListUsersCommand,
  ListAttachedUserPoliciesCommand,
  ListAccessKeysCommand,
  GetAccessKeyLastUsedCommand,
  GetLoginProfileCommand,
  ListUserTagsCommand,
  GetAccountPasswordPolicyCommand,
} from '@aws-sdk/client-iam';
import { DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import {
  ListFunctionsCommand,
  ListTagsCommand as ListLambdaTagsCommand,
} from '@aws-sdk/client-lambda';
import {
  ListQueuesCommand,
  GetQueueAttributesCommand,
  ListQueueTagsCommand,
} from '@aws-sdk/client-sqs';
import { ListTopicsCommand, GetTopicAttributesCommand } from '@aws-sdk/client-sns';
import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
import {
  DescribeParametersCommand,
  ListTagsForResourceCommand as ListSsmTagsCommand,
} from '@aws-sdk/client-ssm';
import { ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DescribeAlarmsCommand,
  ListTagsForResourceCommand as ListCloudWatchTagsCommand,
} from '@aws-sdk/client-cloudwatch';

import type { ResourceSnapshot, AwsService } from '@mcpshield/types';
import { createLogger } from '@mcpshield/logger';
import {
  s3Client,
  iamClient,
  ec2Client,
  cloudTrailClient,
  lambdaClient,
  sqsClient,
  snsClient,
  secretsManagerClient,
  ssmClient,
  dynamoDBClient,
  cloudWatchClient,
} from './clients.js';
import { getConfig } from '@mcpshield/config';

const logger = createLogger('aws-tools:scanner');

/** Helper to convert AWS tags array to Record<string, string> */
function parseAwsTags(
  tagsArray?: Array<{ Key?: string; Value?: string } | { key?: string; value?: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!tagsArray) return result;
  for (const t of tagsArray) {
    const key = ((t as any).Key ?? (t as any).key ?? '') as string;
    const val = ((t as any).Value ?? (t as any).value ?? '') as string;
    if (key) {
      result[key] = val;
    }
  }
  return result;
}

export async function scanS3Buckets(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const bucketsRes = await s3Client.send(new ListBucketsCommand({}));
    const buckets = bucketsRes.Buckets || [];
    const region = getConfig().aws.region;

    for (const b of buckets) {
      const bucketName = b.Name;
      if (!bucketName) continue;

      const attrs: Record<string, unknown> = {
        creationDate: b.CreationDate?.toISOString(),
      };
      let tags: Record<string, string> = {};

      // Public access block
      try {
        const pab = await s3Client.send(new GetPublicAccessBlockCommand({ Bucket: bucketName }));
        attrs.publicAccessBlock = pab.PublicAccessBlockConfiguration;
      } catch (e: any) {
        if (e.name !== 'NoSuchPublicAccessBlockConfiguration') {
          logger.debug(
            `Error getting public access block for S3 bucket ${bucketName}: ${e.message}`,
          );
        }
        attrs.publicAccessBlock = null;
      }

      // ACL
      try {
        const acl = await s3Client.send(new GetBucketAclCommand({ Bucket: bucketName }));
        attrs.acl = {
          grants: acl.Grants,
          owner: acl.Owner,
        };
      } catch (e: any) {
        logger.debug(`Error getting ACL for S3 bucket ${bucketName}: ${e.message}`);
      }

      // Policy
      try {
        const policy = await s3Client.send(new GetBucketPolicyCommand({ Bucket: bucketName }));
        attrs.policy = policy.Policy ? JSON.parse(policy.Policy) : null;
      } catch (e: any) {
        if (e.name !== 'NoSuchBucketPolicy') {
          logger.debug(`Error getting policy for S3 bucket ${bucketName}: ${e.message}`);
        }
        attrs.policy = null;
      }

      // Encryption
      try {
        const enc = await s3Client.send(new GetBucketEncryptionCommand({ Bucket: bucketName }));
        attrs.encryption = enc.ServerSideEncryptionConfiguration;
      } catch (e: any) {
        if (e.name !== 'ServerSideEncryptionConfigurationNotFoundError') {
          logger.debug(`Error getting encryption for S3 bucket ${bucketName}: ${e.message}`);
        }
        attrs.encryption = null;
      }

      // Versioning
      try {
        const ver = await s3Client.send(new GetBucketVersioningCommand({ Bucket: bucketName }));
        attrs.versioning = ver;
      } catch (e: any) {
        logger.debug(`Error getting versioning for S3 bucket ${bucketName}: ${e.message}`);
      }

      // Logging
      try {
        const log = await s3Client.send(new GetBucketLoggingCommand({ Bucket: bucketName }));
        attrs.logging = log.LoggingEnabled || null;
      } catch (e: any) {
        logger.debug(`Error getting logging for S3 bucket ${bucketName}: ${e.message}`);
      }

      // Tags
      try {
        const tagging = await s3Client.send(new GetBucketTaggingCommand({ Bucket: bucketName }));
        tags = parseAwsTags(tagging.TagSet);
      } catch (e: any) {
        if (e.name !== 'NoSuchTagSet') {
          logger.debug(`Error getting tags for S3 bucket ${bucketName}: ${e.message}`);
        }
      }

      snapshots.push({
        service: 's3',
        type: 'bucket',
        id: bucketName,
        arn: `arn:aws:s3:::${bucketName}`,
        region,
        attributes: attrs,
        tags,
      });
    }
  } catch (err: any) {
    logger.error(`Failed to scan S3 buckets: ${err.message}`);
  }
  return snapshots;
}

export async function scanIAM(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  const region = getConfig().aws.region;

  // 1. Password Policy
  try {
    const policyRes = await iamClient.send(new GetAccountPasswordPolicyCommand({}));
    snapshots.push({
      service: 'iam',
      type: 'password-policy',
      id: 'account-password-policy',
      region,
      attributes: {
        policy: policyRes.PasswordPolicy || null,
      },
      tags: {},
    });
  } catch (e: any) {
    if (e.name === 'NoSuchEntityException' || e.name === 'NoSuchEntity') {
      snapshots.push({
        service: 'iam',
        type: 'password-policy',
        id: 'account-password-policy',
        region,
        attributes: { policy: null },
        tags: {},
      });
    } else {
      logger.error(`Error scanning IAM password policy: ${e.message}`);
    }
  }

  // 2. Users
  try {
    const usersRes = await iamClient.send(new ListUsersCommand({}));
    const users = usersRes.Users || [];

    for (const u of users) {
      const userName = u.UserName;
      if (!userName) continue;

      const attrs: Record<string, unknown> = {
        userId: u.UserId,
        createDate: u.CreateDate?.toISOString(),
        passwordLastUsed: u.PasswordLastUsed?.toISOString(),
        arn: u.Arn,
      };
      let tags: Record<string, string> = {};

      // Attached policies
      try {
        const policies = await iamClient.send(
          new ListAttachedUserPoliciesCommand({ UserName: userName }),
        );
        attrs.attachedPolicies = policies.AttachedPolicies || [];
      } catch (e: any) {
        logger.debug(`Error listing policies for user ${userName}: ${e.message}`);
        attrs.attachedPolicies = [];
      }

      // Access Keys
      try {
        const keysRes = await iamClient.send(new ListAccessKeysCommand({ UserName: userName }));
        const keyList = keysRes.AccessKeyMetadata || [];
        const enrichedKeys = [];

        for (const key of keyList) {
          let lastUsed: string | undefined;
          if (key.AccessKeyId) {
            try {
              const lastUsedRes = await iamClient.send(
                new GetAccessKeyLastUsedCommand({ AccessKeyId: key.AccessKeyId }),
              );
              lastUsed = lastUsedRes.AccessKeyLastUsed?.LastUsedDate?.toISOString();
            } catch (e: any) {
              logger.debug(
                `Error getting access key last used for key ${key.AccessKeyId}: ${e.message}`,
              );
            }
          }
          enrichedKeys.push({
            accessKeyId: key.AccessKeyId,
            status: key.Status,
            createDate: key.CreateDate?.toISOString(),
            lastUsedDate: lastUsed,
          });
        }
        attrs.accessKeys = enrichedKeys;
      } catch (e: any) {
        logger.debug(`Error listing access keys for user ${userName}: ${e.message}`);
        attrs.accessKeys = [];
      }

      // Console Login Profile
      try {
        await iamClient.send(new GetLoginProfileCommand({ UserName: userName }));
        attrs.hasLoginProfile = true;
      } catch {
        attrs.hasLoginProfile = false;
      }

      // Tags
      try {
        const tagsRes = await iamClient.send(new ListUserTagsCommand({ UserName: userName }));
        tags = parseAwsTags(tagsRes.Tags);
      } catch (e: any) {
        logger.debug(`Error listing tags for user ${userName}: ${e.message}`);
      }

      snapshots.push({
        service: 'iam',
        type: 'user',
        id: userName,
        arn: u.Arn,
        region,
        attributes: attrs,
        tags,
      });
    }
  } catch (err: any) {
    logger.error(`Failed to scan IAM users: ${err.message}`);
  }

  return snapshots;
}

export async function scanEC2(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const sgsRes = await ec2Client.send(new DescribeSecurityGroupsCommand({}));
    const sgs = sgsRes.SecurityGroups || [];
    const region = getConfig().aws.region;

    for (const sg of sgs) {
      const sgId = sg.GroupId;
      if (!sgId) continue;

      const tags = parseAwsTags(sg.Tags);
      snapshots.push({
        service: 'ec2',
        type: 'security-group',
        id: sgId,
        arn: `arn:aws:ec2:${region}:000000000000:security-group/${sgId}`,
        region,
        attributes: {
          groupName: sg.GroupName,
          description: sg.Description,
          ipPermissions: sg.IpPermissions || [],
          ipPermissionsEgress: sg.IpPermissionsEgress || [],
          vpcId: sg.VpcId,
        },
        tags,
      });
    }
  } catch (err: any) {
    logger.error(`Failed to scan EC2 security groups: ${err.message}`);
  }
  return snapshots;
}

export async function scanCloudTrail(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const trailsRes = await cloudTrailClient.send(new DescribeTrailsCommand({}));
    const trails = trailsRes.trailList || [];
    const region = getConfig().aws.region;

    for (const t of trails) {
      const trailName = t.Name;
      if (!trailName) continue;

      const attrs: Record<string, unknown> = {
        trail: t,
      };

      try {
        const status = await cloudTrailClient.send(new GetTrailStatusCommand({ Name: t.TrailARN }));
        attrs.status = status;
      } catch (e: any) {
        logger.debug(`Error getting trail status for ${trailName}: ${e.message}`);
      }

      snapshots.push({
        service: 'cloudtrail',
        type: 'trail',
        id: trailName,
        arn: t.TrailARN,
        region,
        attributes: attrs,
        tags: {}, // LocalStack might not support tags on trails or we can mock/fetch if available
      });
    }
  } catch (err: any) {
    logger.error(`Failed to scan CloudTrail: ${err.message}`);
  }
  return snapshots;
}

export async function scanLambda(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const res = await lambdaClient.send(new ListFunctionsCommand({}));
    const functions = res.Functions || [];
    const region = getConfig().aws.region;

    for (const f of functions) {
      if (!f.FunctionName) continue;
      let tags: Record<string, string> = {};
      try {
        const tagsRes = await lambdaClient.send(
          new ListLambdaTagsCommand({ Resource: f.FunctionArn }),
        );
        tags = tagsRes.Tags || {};
      } catch (e: any) {
        logger.debug(`Error getting tags for Lambda ${f.FunctionName}: ${e.message}`);
      }

      snapshots.push({
        service: 'lambda',
        type: 'function',
        id: f.FunctionName,
        arn: f.FunctionArn,
        region,
        attributes: {
          runtime: f.Runtime,
          handler: f.Handler,
          lastModified: f.LastModified,
        },
        tags,
      });
    }
  } catch (err: any) {
    logger.debug(`Failed to scan Lambda: ${err.message}`);
  }
  return snapshots;
}

export async function scanSQS(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const res = await sqsClient.send(new ListQueuesCommand({}));
    const urls = res.QueueUrls || [];
    const region = getConfig().aws.region;

    for (const url of urls) {
      const parts = url.split('/');
      const queueName = parts[parts.length - 1] || url;
      let tags: Record<string, string> = {};
      let arn = '';

      let kmsKeyId = '';
      try {
        const attrs = await sqsClient.send(
          new GetQueueAttributesCommand({
            QueueUrl: url,
            AttributeNames: ['QueueArn', 'KmsMasterKeyId'],
          }),
        );
        arn = attrs.Attributes?.QueueArn || '';
        kmsKeyId = attrs.Attributes?.KmsMasterKeyId || '';
      } catch (e: any) {
        logger.debug(`Error getting attributes for SQS ${queueName}: ${e.message}`);
      }

      try {
        const tagsRes = await sqsClient.send(new ListQueueTagsCommand({ QueueUrl: url }));
        tags = tagsRes.Tags || {};
      } catch (e: any) {
        logger.debug(`Error getting tags for SQS ${queueName}: ${e.message}`);
      }

      snapshots.push({
        service: 'sqs',
        type: 'queue',
        id: queueName,
        arn: arn || undefined,
        region,
        attributes: { queueUrl: url, kmsMasterKeyId: kmsKeyId },
        tags,
      });
    }
  } catch (err: any) {
    logger.debug(`Failed to scan SQS: ${err.message}`);
  }
  return snapshots;
}

export async function scanSNS(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const res = await snsClient.send(new ListTopicsCommand({}));
    const topics = res.Topics || [];
    const region = getConfig().aws.region;

    for (const t of topics) {
      if (!t.TopicArn) continue;
      const parts = t.TopicArn.split(':');
      const topicName = parts[parts.length - 1] || t.TopicArn;
      const tags: Record<string, string> = {};

      let kmsKeyId = '';
      try {
        const attrsRes = await snsClient.send(
          new GetTopicAttributesCommand({ TopicArn: t.TopicArn }),
        );
        kmsKeyId = attrsRes.Attributes?.KmsMasterKeyId || '';
      } catch (e: any) {
        logger.debug(`Error getting attributes for SNS topic ${topicName}: ${e.message}`);
      }

      snapshots.push({
        service: 'sns',
        type: 'topic',
        id: topicName,
        arn: t.TopicArn,
        region,
        attributes: { kmsMasterKeyId: kmsKeyId },
        tags,
      });
    }
  } catch (err: any) {
    logger.debug(`Failed to scan SNS: ${err.message}`);
  }
  return snapshots;
}

export async function scanSecretsManager(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const res = await secretsManagerClient.send(new ListSecretsCommand({}));
    const secrets = res.SecretList || [];
    const region = getConfig().aws.region;

    for (const s of secrets) {
      if (!s.Name) continue;
      const tags = parseAwsTags(s.Tags);

      snapshots.push({
        service: 'secretsmanager',
        type: 'secret',
        id: s.Name,
        arn: s.ARN,
        region,
        attributes: {
          description: s.Description,
          lastAccessedDate: s.LastAccessedDate?.toISOString(),
          kmsKeyId: s.KmsKeyId || null,
        },
        tags,
      });
    }
  } catch (err: any) {
    logger.debug(`Failed to scan Secrets Manager: ${err.message}`);
  }
  return snapshots;
}

export async function scanSSM(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const res = await ssmClient.send(new DescribeParametersCommand({}));
    const parameters = res.Parameters || [];
    const region = getConfig().aws.region;

    for (const p of parameters) {
      if (!p.Name) continue;
      let tags: Record<string, string> = {};

      try {
        const tagsRes = await ssmClient.send(
          new ListSsmTagsCommand({
            ResourceType: 'Parameter',
            ResourceId: p.Name,
          }),
        );
        tags = parseAwsTags(tagsRes.TagList);
      } catch (e: any) {
        logger.debug(`Error getting tags for SSM parameter ${p.Name}: ${e.message}`);
      }

      snapshots.push({
        service: 'ssm',
        type: 'parameter',
        id: p.Name,
        arn: `arn:aws:ssm:${region}:000000000000:parameter/${p.Name.replace(/^\//, '')}`,
        region,
        attributes: {
          type: p.Type,
          description: p.Description,
          lastModifiedDate: p.LastModifiedDate?.toISOString(),
        },
        tags,
      });
    }
  } catch (err: any) {
    logger.debug(`Failed to scan SSM parameters: ${err.message}`);
  }
  return snapshots;
}

export async function scanDynamoDB(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const res = await dynamoDBClient.send(new ListTablesCommand({}));
    const tables = res.TableNames || [];
    const region = getConfig().aws.region;

    for (const table of tables) {
      let arn = '';
      const tags: Record<string, string> = {};

      let sseType: string | null = null;
      let kmsMasterKeyArn: string | null = null;

      try {
        const desc = await dynamoDBClient.send(new DescribeTableCommand({ TableName: table }));
        arn = desc.Table?.TableArn || '';
        sseType = desc.Table?.SSEDescription?.SSEType || null;
        kmsMasterKeyArn = desc.Table?.SSEDescription?.KMSMasterKeyArn || null;
      } catch (e: any) {
        logger.debug(`Error describing DynamoDB table ${table}: ${e.message}`);
      }

      snapshots.push({
        service: 'dynamodb',
        type: 'table',
        id: table,
        arn: arn || undefined,
        region,
        attributes: { sseType, kmsMasterKeyArn },
        tags,
      });
    }
  } catch (err: any) {
    logger.debug(`Failed to scan DynamoDB tables: ${err.message}`);
  }
  return snapshots;
}

export async function scanCloudWatch(): Promise<ResourceSnapshot[]> {
  const snapshots: ResourceSnapshot[] = [];
  try {
    const res = await cloudWatchClient.send(new DescribeAlarmsCommand({}));
    const alarms = res.MetricAlarms || [];
    const region = getConfig().aws.region;

    for (const a of alarms) {
      if (!a.AlarmName) continue;
      let tags: Record<string, string> = {};

      try {
        const tagsRes = await cloudWatchClient.send(
          new ListCloudWatchTagsCommand({ ResourceARN: a.AlarmArn }),
        );
        tags = parseAwsTags(tagsRes.Tags);
      } catch (e: any) {
        logger.debug(`Error getting tags for CloudWatch alarm ${a.AlarmName}: ${e.message}`);
      }

      snapshots.push({
        service: 'cloudwatch',
        type: 'alarm',
        id: a.AlarmName,
        arn: a.AlarmArn,
        region,
        attributes: {
          metricName: a.MetricName,
          namespace: a.Namespace,
          stateValue: a.StateValue,
        },
        tags,
      });
    }
  } catch (err: any) {
    logger.debug(`Failed to scan CloudWatch alarms: ${err.message}`);
  }
  return snapshots;
}

/**
 * Scan the environment. Runs scans across all selected services (or all if omitted).
 */
export async function scanEnvironment(services?: AwsService[]): Promise<ResourceSnapshot[]> {
  const endpoint = getConfig().aws.endpoint;
  logger.info(`Auto-detecting target cloud environment at endpoint: ${endpoint}...`);

  let isLocalStack = false;
  let isAWS = false;
  try {
    await s3Client.send(new ListBucketsCommand({}));
    isAWS = true;
    if (endpoint) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${endpoint}/_localstack/health`, { signal: controller.signal });
        clearTimeout(id);
        if (res.ok) isLocalStack = true;
      } catch {}
    }
  } catch (e: any) {
    logger.debug(`AWS API probe failed: ${e.message}`);
  }

  if (isAWS) {
    if (isLocalStack) {
      logger.info(`Detected Environment Target: [AWS (LocalStack Sandbox)]`);
    } else {
      logger.info(`Detected Environment Target: [AWS (Production / Real Cloud)]`);
    }
  } else {
    logger.warn(
      `Could not confirm AWS API signature at ${endpoint}. Supported providers: AWS, LocalStack.`,
    );
  }

  logger.info(`Starting scanning. Target services: ${services?.join(', ') || 'ALL'}`);

  const activeServices = new Set(
    services || [
      's3',
      'iam',
      'ec2',
      'cloudtrail',
      'lambda',
      'sqs',
      'sns',
      'secretsmanager',
      'ssm',
      'dynamodb',
      'cloudwatch',
    ],
  );

  const scanPromises: Promise<ResourceSnapshot[]>[] = [];

  if (activeServices.has('s3')) scanPromises.push(scanS3Buckets());
  if (activeServices.has('iam')) scanPromises.push(scanIAM());
  if (activeServices.has('ec2')) scanPromises.push(scanEC2());
  if (activeServices.has('cloudtrail')) scanPromises.push(scanCloudTrail());
  if (activeServices.has('lambda')) scanPromises.push(scanLambda());
  if (activeServices.has('sqs')) scanPromises.push(scanSQS());
  if (activeServices.has('sns')) scanPromises.push(scanSNS());
  if (activeServices.has('secretsmanager')) scanPromises.push(scanSecretsManager());
  if (activeServices.has('ssm')) scanPromises.push(scanSSM());
  if (activeServices.has('dynamodb')) scanPromises.push(scanDynamoDB());
  if (activeServices.has('cloudwatch')) scanPromises.push(scanCloudWatch());

  const results = await Promise.all(scanPromises);
  const flattened = results.flat();

  logger.info(`AWS scan finished. Found ${flattened.length} total resource configurations.`);
  return flattened;
}
