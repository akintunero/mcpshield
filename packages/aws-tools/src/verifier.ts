import {
  GetPublicAccessBlockCommand,
  GetBucketAclCommand,
  GetBucketVersioningCommand,
  GetBucketEncryptionCommand,
} from '@aws-sdk/client-s3';
import { GetRolePolicyCommand, ListRolePoliciesCommand } from '@aws-sdk/client-iam';
import { GetKeyRotationStatusCommand, DescribeKeyCommand } from '@aws-sdk/client-kms';
import { DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';
import {
  DescribeSecurityGroupsCommand,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';

import {
  s3Client,
  iamClient,
  ec2Client,
  kmsClient,
  secretsManagerClient,
} from './clients.js';
import { createLogger } from '@mcpshield/logger';
import { getConfig } from '@mcpshield/config';

const logger = createLogger('aws-tools:verifier');

export interface VerificationResult {
  catalogId: string;
  resourceId: string;
  verified: boolean;
  details: Record<string, unknown>;
  verificationCommand: string;
  expectedBefore: string;
  expectedAfter: string;
}

export async function verifyPublicS3Bucket(
  bucketName: string,
): Promise<VerificationResult> {
  const region = getConfig().aws.region;
  const ep = getConfig().aws.endpoint;
  const baseCmd = ep
    ? `aws --endpoint-url=${ep} --region=${region}`
    : `aws --region=${region}`;

  const verificationCommand = `${baseCmd} s3api get-public-access-block --bucket ${bucketName}`;
  let isPublic = false;
  const details: Record<string, unknown> = {};

  try {
    const pab = await s3Client.send(
      new GetPublicAccessBlockCommand({ Bucket: bucketName }),
    );
    const cfg = pab.PublicAccessBlockConfiguration;
    details.publicAccessBlock = cfg;
    isPublic =
      !cfg ||
      cfg.BlockPublicAcls !== true ||
      cfg.IgnorePublicAcls !== true ||
      cfg.BlockPublicPolicy !== true ||
      cfg.RestrictPublicBuckets !== true;
  } catch {
    isPublic = true;
    details.publicAccessBlock = null;
  }

  if (isPublic) {
    try {
      const acl = await s3Client.send(new GetBucketAclCommand({ Bucket: bucketName }));
      const publicGrants = (acl.Grants || []).filter((g: any) => {
        const uri = g.Grantee?.URI || '';
        return uri.includes('AllUsers') || uri.includes('AuthenticatedUsers');
      });
      details.publicAclGrants = publicGrants.length > 0 ? publicGrants : 'none';
    } catch {
      details.aclError = true;
    }
  }

  return {
    catalogId: 'MCPS-S3-001',
    resourceId: bucketName,
    verified: !isPublic,
    details,
    verificationCommand,
    expectedBefore: `BlockPublicAcls=false or public ACL grants exist`,
    expectedAfter: `BlockPublicAcls=true, BlockPublicPolicy=true, RestrictPublicBuckets=true, no public ACL grants`,
  };
}

export async function verifyS3Versioning(
  bucketName: string,
): Promise<VerificationResult> {
  const region = getConfig().aws.region;
  const ep = getConfig().aws.endpoint;
  const baseCmd = ep
    ? `aws --endpoint-url=${ep} --region=${region}`
    : `aws --region=${region}`;

  const verificationCommand = `${baseCmd} s3api get-bucket-versioning --bucket ${bucketName}`;
  const details: Record<string, unknown> = {};

  let enabled = false;
  try {
    const ver = await s3Client.send(
      new GetBucketVersioningCommand({ Bucket: bucketName }),
    );
    details.status = ver.Status || 'Disabled';
    enabled = ver.Status === 'Enabled';
  } catch (e: any) {
    details.error = e.message;
    enabled = false;
  }

  return {
    catalogId: 'MCPS-S3-003',
    resourceId: bucketName,
    verified: enabled,
    details,
    verificationCommand,
    expectedBefore: `Status != "Enabled" (default: Disabled)`,
    expectedAfter: `Status = "Enabled"`,
  };
}

export async function verifyS3Encryption(
  bucketName: string,
): Promise<VerificationResult> {
  const region = getConfig().aws.region;
  const ep = getConfig().aws.endpoint;
  const baseCmd = ep
    ? `aws --endpoint-url=${ep} --region=${region}`
    : `aws --region=${region}`;

  const verificationCommand = `${baseCmd} s3api get-bucket-encryption --bucket ${bucketName}`;
  const details: Record<string, unknown> = {};

  let hasEncryption = false;
  try {
    const enc = await s3Client.send(
      new GetBucketEncryptionCommand({ Bucket: bucketName }),
    );
    const rules = enc.ServerSideEncryptionConfiguration?.Rules;
    const algo = rules?.[0]?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm;
    details.algorithm = algo || 'none';
    hasEncryption = algo === 'AES256' || algo === 'aws:kms';
  } catch (e: any) {
    details.error = e.message;
    details.algorithm = 'none';
    hasEncryption = false;
  }

  return {
    catalogId: 'MCPS-S3-002',
    resourceId: bucketName,
    verified: hasEncryption,
    details,
    verificationCommand,
    expectedBefore: `No default encryption configured (algorithm: none)`,
    expectedAfter: `Default encryption enabled (algorithm: AES256 or aws:kms)`,
  };
}

export async function verifyOverlyPermissiveRole(
  roleName: string,
): Promise<VerificationResult> {
  const region = getConfig().aws.region;
  const ep = getConfig().aws.endpoint;
  const baseCmd = ep
    ? `aws --endpoint-url=${ep} --region=${region}`
    : `aws --region=${region}`;

  const verificationCommand = `${baseCmd} iam get-role-policy --role-name ${roleName} --policy-name ${roleName}-admin-access`;
  const details: Record<string, unknown> = {};
  let isWildcard = false;

  try {
    const policies = await iamClient.send(
      new ListRolePoliciesCommand({ RoleName: roleName }),
    );
    const names = policies.PolicyNames || [];
    details.policyNames = names;

    for (const name of names) {
      try {
        const policy = await iamClient.send(
          new GetRolePolicyCommand({ RoleName: roleName, PolicyName: name }),
        );
        if (policy.PolicyDocument) {
          const doc = JSON.parse(decodeURIComponent(policy.PolicyDocument));
          const stmts = Array.isArray(doc.Statement) ? doc.Statement : [doc.Statement];
          for (const stmt of stmts) {
            if (
              stmt.Effect === 'Allow' &&
              (stmt.Action === '*' || stmt.Action?.includes('*')) &&
              (stmt.Resource === '*' || stmt.Resource?.includes('*'))
            ) {
              isWildcard = true;
              details.wildcardPolicyName = name;
              details.wildcardStatement = stmt;
            }
          }
        }
      } catch {
        // try next
      }
    }
  } catch (e: any) {
    details.error = e.message;
  }

  return {
    catalogId: 'MCPS-IAM-006',
    resourceId: roleName,
    verified: !isWildcard,
    details,
    verificationCommand,
    expectedBefore: `Inline policy with Action="*" and Resource="*"`,
    expectedAfter: `Inline policy with scoped actions (e.g. s3:GetObject, ec2:Describe*)`,
  };
}

export async function verifyKmsRotation(
  keyId: string,
): Promise<VerificationResult> {
  const region = getConfig().aws.region;
  const ep = getConfig().aws.endpoint;
  const baseCmd = ep
    ? `aws --endpoint-url=${ep} --region=${region}`
    : `aws --region=${region}`;

  const verificationCommand = `${baseCmd} kms get-key-rotation-status --key-id ${keyId}`;
  const details: Record<string, unknown> = {};
  let rotationEnabled = false;

  try {
    const rotation = await kmsClient.send(
      new GetKeyRotationStatusCommand({ KeyId: keyId }),
    );
    rotationEnabled = rotation.KeyRotationEnabled === true;
    details.keyRotationEnabled = rotationEnabled;
  } catch (e: any) {
    details.error = e.message;
  }

  try {
    const desc = await kmsClient.send(new DescribeKeyCommand({ KeyId: keyId }));
    details.keyMetadata = {
      enabled: desc.KeyMetadata?.Enabled,
      keyState: desc.KeyMetadata?.KeyState,
      description: desc.KeyMetadata?.Description,
    };
  } catch {
    // skip
  }

  return {
    catalogId: 'MCPS-KMS-001',
    resourceId: keyId,
    verified: rotationEnabled,
    details,
    verificationCommand,
    expectedBefore: `KeyRotationEnabled = false`,
    expectedAfter: `KeyRotationEnabled = true`,
  };
}

export async function verifySecretRotation(
  secretName: string,
): Promise<VerificationResult> {
  const region = getConfig().aws.region;
  const ep = getConfig().aws.endpoint;
  const baseCmd = ep
    ? `aws --endpoint-url=${ep} --region=${region}`
    : `aws --region=${region}`;

  const verificationCommand = `${baseCmd} secretsmanager describe-secret --secret-id ${secretName}`;
  const details: Record<string, unknown> = {};
  let rotationConfigured = false;

  try {
    const secret = await secretsManagerClient.send(
      new DescribeSecretCommand({ SecretId: secretName }),
    );
    details.description = secret.Description;
    details.rotationEnabled = secret.RotationEnabled ?? false;
    rotationConfigured =
      secret.RotationEnabled === true ||
      (secret.Description || '').includes('Rotation enabled');
  } catch (e: any) {
    details.error = e.message;
  }

  return {
    catalogId: 'MCPS-SECRETS-001',
    resourceId: secretName,
    verified: rotationConfigured,
    details,
    verificationCommand,
    expectedBefore: `Rotation not configured (description does not mention rotation)`,
    expectedAfter: `Description includes "Rotation enabled"`,
  };
}

export async function verifyEc2SshOpen(
  sgId: string,
): Promise<VerificationResult> {
  const region = getConfig().aws.region;
  const ep = getConfig().aws.endpoint;
  const baseCmd = ep
    ? `aws --endpoint-url=${ep} --region=${region}`
    : `aws --region=${region}`;

  const verificationCommand = `${baseCmd} ec2 describe-security-groups --group-ids ${sgId}`;
  const details: Record<string, unknown> = {};
  let sshOpen = false;

  try {
    const sgs = await ec2Client.send(
      new DescribeSecurityGroupsCommand({ GroupIds: [sgId] }),
    );
    const sg = sgs.SecurityGroups?.[0];
    const perms = sg?.IpPermissions || [];
    details.ipPermissions = perms;

    sshOpen = perms.some((p: any) => {
      const isTcp = p.IpProtocol === 'tcp' || p.IpProtocol === '-1';
      const isPort22 = p.FromPort <= 22 && p.ToPort >= 22;
      const isOpen =
        p.IpRanges?.some((r: any) => r.CidrIp === '0.0.0.0/0') ||
        p.Ipv6Ranges?.some((r: any) => r.CidrIpv6 === '::/0');
      return isTcp && isPort22 && isOpen;
    });
  } catch (e: any) {
    details.error = e.message;
  }

  return {
    catalogId: 'MCPS-EC2-001',
    resourceId: sgId,
    verified: !sshOpen,
    details,
    verificationCommand,
    expectedBefore: `IpRanges contains 0.0.0.0/0 on port 22`,
    expectedAfter: `No 0.0.0.0/0 rule on port 22 (removed or restricted to trusted CIDR)`,
  };
}

/**
 * Registry of verification functions keyed by catalog ID.
 * Register a new verifier here when adding a new finding type —
 * no switch statement to update.
 */
const VERIFIER_REGISTRY: Record<string, (id: string) => Promise<VerificationResult>> = {
  'MCPS-S3-001': verifyPublicS3Bucket,
  'MCPS-S3-002': verifyS3Encryption,
  'MCPS-S3-003': verifyS3Versioning,
  'MCPS-IAM-006': verifyOverlyPermissiveRole,
  'MCPS-KMS-001': verifyKmsRotation,
  'MCPS-SECRETS-001': verifySecretRotation,
  'MCPS-EC2-001': verifyEc2SshOpen,
};

/**
 * Run the correct verification check based on catalogId.
 * Looks up the verifier function from VERIFIER_REGISTRY.
 */
export async function verifyFinding(
  catalogId: string,
  resourceId: string,
): Promise<VerificationResult | null> {
  const fn = VERIFIER_REGISTRY[catalogId];
  if (fn) return fn(resourceId);
  logger.warn(`No verifier registered for catalogId: ${catalogId}`);
  return null;
}
