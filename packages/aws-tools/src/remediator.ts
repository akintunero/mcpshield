import {
  PutPublicAccessBlockCommand,
  PutBucketEncryptionCommand,
  PutBucketVersioningCommand,
  PutBucketLoggingCommand,
  PutBucketTaggingCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import {
  DetachUserPolicyCommand,
  UpdateAccessKeyCommand,
  UpdateAccountPasswordPolicyCommand,
  DeleteLoginProfileCommand,
  ListAttachedUserPoliciesCommand,
  ListAccessKeysCommand,
  DeleteAccessKeyCommand,
  DeleteUserCommand,
} from '@aws-sdk/client-iam';
import {
  RevokeSecurityGroupIngressCommand,
  DescribeSecurityGroupsCommand,
} from '@aws-sdk/client-ec2';
import { StartLoggingCommand } from '@aws-sdk/client-cloudtrail';
import { PutParameterCommand } from '@aws-sdk/client-ssm';

import type { RemediationAction, RemediationResult } from '@mcpshield/types';
import { createLogger } from '@mcpshield/logger';
import { s3Client, iamClient, ec2Client, cloudTrailClient, ssmClient } from './clients.js';
import { nowIso } from '@mcpshield/shared';

const logger = createLogger('aws-tools:remediator');

export async function executeRemediationAction(
  action: RemediationAction,
): Promise<RemediationResult> {
  const { findingId, catalogId, service, operation, params } = action;
  logger.info(`Executing remediation action: ${service}:${operation} for ${findingId}`);

  try {
    switch (service) {
      case 's3': {
        if (operation === 'putPublicAccessBlock') {
          const bucket = params.bucket as string;
          await s3Client.send(
            new PutPublicAccessBlockCommand({
              Bucket: bucket,
              PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                IgnorePublicAcls: true,
                BlockPublicPolicy: true,
                RestrictPublicBuckets: true,
              },
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully enabled S3 Block Public Access for bucket "${bucket}".`,
            executedAt: nowIso(),
          };
        }

        if (operation === 'putBucketEncryption') {
          const bucket = params.bucket as string;
          await s3Client.send(
            new PutBucketEncryptionCommand({
              Bucket: bucket,
              ServerSideEncryptionConfiguration: {
                Rules: [
                  {
                    ApplyServerSideEncryptionByDefault: {
                      SSEAlgorithm: 'AES256',
                    },
                  },
                ],
              },
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully enabled default AES256 server-side encryption for S3 bucket "${bucket}".`,
            executedAt: nowIso(),
          };
        }

        if (operation === 'putBucketVersioning') {
          const bucket = params.bucket as string;
          await s3Client.send(
            new PutBucketVersioningCommand({
              Bucket: bucket,
              VersioningConfiguration: {
                Status: 'Enabled',
              },
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully enabled S3 Versioning for bucket "${bucket}".`,
            executedAt: nowIso(),
          };
        }

        if (operation === 'putBucketLogging') {
          const bucket = params.bucket as string;
          const targetBucket = (params.targetBucket as string) || `${bucket}-logs`;
          const targetPrefix = (params.targetPrefix as string) || 's3-access/';

          // Create the logs bucket first if needed
          try {
            await s3Client.send(new CreateBucketCommand({ Bucket: targetBucket }));
          } catch {
            // Might already exist
          }

          await s3Client.send(
            new PutBucketLoggingCommand({
              Bucket: bucket,
              BucketLoggingStatus: {
                LoggingEnabled: {
                  TargetBucket: targetBucket,
                  TargetPrefix: targetPrefix,
                },
              },
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully enabled S3 Server Access Logging for bucket "${bucket}" pointing to "${targetBucket}".`,
            executedAt: nowIso(),
          };
        }

        if (operation === 'putBucketTagging') {
          const bucket = params.bucket as string;
          const tags = params.tags as Record<string, string>;
          const tagSet = Object.entries(tags).map(([k, v]) => ({ Key: k, Value: v }));
          await s3Client.send(
            new PutBucketTaggingCommand({
              Bucket: bucket,
              Tagging: { TagSet: tagSet },
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully updated required tags (Owner, Environment, DataClassification) for bucket "${bucket}".`,
            executedAt: nowIso(),
          };
        }

        if (operation === 'renameBucket') {
          const oldBucket = params.bucket as string;
          const newBucket = (params.newBucket as string) || 'workshop-mcpshield-data';

          // 1. Create new bucket
          await s3Client.send(new CreateBucketCommand({ Bucket: newBucket }));

          // 2. Sync objects if any
          try {
            const list = await s3Client.send(new ListObjectsV2Command({ Bucket: oldBucket }));
            const objects = list.Contents || [];
            for (const obj of objects) {
              if (obj.Key) {
                await s3Client.send(
                  new CopyObjectCommand({
                    Bucket: newBucket,
                    CopySource: `${oldBucket}/${obj.Key}`,
                    Key: obj.Key,
                  }),
                );
              }
            }

            // 3. Delete objects in old bucket
            if (objects.length > 0) {
              await s3Client.send(
                new DeleteObjectsCommand({
                  Bucket: oldBucket,
                  Delete: { Objects: objects.map((o) => ({ Key: o.Key! })) },
                }),
              );
            }
          } catch (e: any) {
            logger.debug(`Error copying objects during rename: ${e.message}`);
          }

          // 4. Delete old bucket
          await s3Client.send(new DeleteBucketCommand({ Bucket: oldBucket }));

          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully renamed bucket "${oldBucket}" to compliance-conforming "${newBucket}" and migrated contents.`,
            executedAt: nowIso(),
          };
        }
        break;
      }

      case 'iam': {
        if (operation === 'detachUserPolicy') {
          const userName = params.userName as string;
          const policyArn = params.policyArn as string;

          await iamClient.send(
            new DetachUserPolicyCommand({
              UserName: userName,
              PolicyArn: policyArn,
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully detached policy "${policyArn.split('/').pop()}" from user "${userName}".`,
            executedAt: nowIso(),
          };
        }

        if (operation === 'deactivateAccessKey') {
          const userName = params.userName as string;
          const accessKeyId = params.accessKeyId as string;

          await iamClient.send(
            new UpdateAccessKeyCommand({
              UserName: userName,
              AccessKeyId: accessKeyId,
              Status: 'Inactive',
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully deactivated stale access key "${accessKeyId}" for user "${userName}".`,
            executedAt: nowIso(),
          };
        }

        if (operation === 'updatePasswordPolicy') {
          await iamClient.send(
            new UpdateAccountPasswordPolicyCommand({
              MinimumPasswordLength: 14,
              RequireSymbols: true,
              RequireNumbers: true,
              RequireUppercaseCharacters: true,
              RequireLowercaseCharacters: true,
              AllowUsersToChangePassword: true,
              PasswordReusePrevention: 24,
              MaxPasswordAge: 90,
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message:
              'Successfully enforced strong password policy (Min length 14, complexity, history).',
            executedAt: nowIso(),
          };
        }

        if (operation === 'deleteUser') {
          const userName = params.userName as string;

          // 1. Delete login profile
          try {
            await iamClient.send(new DeleteLoginProfileCommand({ UserName: userName }));
          } catch {
            // Might not have console access
          }

          // 2. Detach policies
          try {
            const policies = await iamClient.send(
              new ListAttachedUserPoliciesCommand({ UserName: userName }),
            );
            for (const p of policies.AttachedPolicies || []) {
              if (p.PolicyArn) {
                await iamClient.send(
                  new DetachUserPolicyCommand({ UserName: userName, PolicyArn: p.PolicyArn }),
                );
              }
            }
          } catch (e: any) {
            logger.debug(`Error detaching policies for user ${userName}: ${e.message}`);
          }

          // 3. Delete access keys
          try {
            const keysRes = await iamClient.send(new ListAccessKeysCommand({ UserName: userName }));
            for (const k of keysRes.AccessKeyMetadata || []) {
              if (k.AccessKeyId) {
                await iamClient.send(
                  new DeleteAccessKeyCommand({ UserName: userName, AccessKeyId: k.AccessKeyId }),
                );
              }
            }
          } catch (e: any) {
            logger.debug(`Error deleting keys for user ${userName}: ${e.message}`);
          }

          // 4. Delete user
          await iamClient.send(new DeleteUserCommand({ UserName: userName }));

          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully deleted unused IAM user "${userName}" and associated login credentials.`,
            executedAt: nowIso(),
          };
        }
        break;
      }

      case 'ec2': {
        if (operation === 'revokeSecurityGroupIngress') {
          const sgId = params.sgId as string;
          const port = params.port as number;

          // Check if it's currently open to the internet
          const descSg = await ec2Client.send(
            new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }),
          );
          const sg = descSg.SecurityGroups?.[0];
          const hasInternetIngress = sg?.IpPermissions?.some(
            (p) =>
              p.FromPort === port &&
              p.ToPort === port &&
              p.IpRanges?.some((r) => r.CidrIp === '0.0.0.0/0'),
          );

          if (hasInternetIngress) {
            await ec2Client.send(
              new RevokeSecurityGroupIngressCommand({
                GroupId: sgId,
                IpPermissions: [
                  {
                    IpProtocol: 'tcp',
                    FromPort: port,
                    ToPort: port,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }],
                  },
                ],
              }),
            );
          }

          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully revoked public internet ingress for port ${port} on security group "${sgId}".`,
            executedAt: nowIso(),
          };
        }
        break;
      }

      case 'cloudtrail': {
        if (operation === 'startLogging') {
          const trailName = params.trailName as string;
          await cloudTrailClient.send(
            new StartLoggingCommand({
              Name: trailName,
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully started CloudTrail logging for trail "${trailName}".`,
            executedAt: nowIso(),
          };
        }
        break;
      }

      case 'ssm': {
        if (operation === 'putParameterDescription') {
          const paramName = params.parameterName as string;
          const description = params.description as string;
          const paramType = params.parameterType as string;
          const value = params.value as string;

          await ssmClient.send(
            new PutParameterCommand({
              Name: paramName,
              Description: description,
              Type: paramType as any,
              Value: value,
              Overwrite: true,
            }),
          );
          return {
            findingId,
            catalogId,
            success: true,
            message: `Successfully added description to SSM Parameter "${paramName}".`,
            executedAt: nowIso(),
          };
        }
        break;
      }
    }

    throw new Error(`Unsupported service/operation: ${service}/${operation}`);
  } catch (err: any) {
    logger.error(`Remediation action failed: ${err.message}`, err);
    return {
      findingId,
      catalogId,
      success: false,
      message: `Failed to execute remediation: ${err.message}`,
      executedAt: nowIso(),
    };
  }
}
