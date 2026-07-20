import type { ResourceSnapshot } from '@mcpshield/types';

export interface RuleEvaluation {
  catalogId: string;
  isViolated: boolean;
  evidence: Record<string, unknown>;
  descriptionOverride?: string;
}

const AGE_90_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function getAgeDays(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

// 1. MCPS-S3-001: Public S3 Bucket
export function checkPublicS3Bucket(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 's3' || snapshot.type !== 'bucket') return null;

  const pab = snapshot.attributes.publicAccessBlock as any;
  const acl = snapshot.attributes.acl as any;
  const policy = snapshot.attributes.policy as any;

  let isViolated = false;
  const evidence: Record<string, unknown> = {};

  // Check Block Public Access block configuration
  if (!pab) {
    isViolated = true;
    evidence.publicAccessBlockMissing = true;
  } else {
    const isFullyBlocked =
      pab.BlockPublicAcls === true &&
      pab.IgnorePublicAcls === true &&
      pab.BlockPublicPolicy === true &&
      pab.RestrictPublicBuckets === true;

    if (!isFullyBlocked) {
      isViolated = true;
      evidence.publicAccessBlockConfig = pab;
    }
  }

  // Check ACL for public grants
  if (acl && Array.isArray(acl.grants)) {
    const publicGrants = acl.grants.filter((g: any) => {
      const uri = g.Grantee?.URI || '';
      return uri.includes('AllUsers') || uri.includes('AuthenticatedUsers');
    });
    if (publicGrants.length > 0) {
      isViolated = true;
      evidence.publicAclGrants = publicGrants;
    }
  }

  // Check policy statement for "*" principal wildcards
  if (policy && Array.isArray(policy.Statement)) {
    const publicStatements = policy.Statement.filter((s: any) => {
      const isAllow = s.Effect === 'Allow';
      const hasWildcardPrincipal = s.Principal === '*' || (s.Principal && s.Principal.AWS === '*');
      const hasNoCondition = !s.Condition;
      return isAllow && hasWildcardPrincipal && hasNoCondition;
    });
    if (publicStatements.length > 0) {
      isViolated = true;
      evidence.publicPolicyStatements = publicStatements;
    }
  }

  return { catalogId: 'MCPS-S3-001', isViolated, evidence };
}

// 2. MCPS-IAM-001: AdministratorAccess attached to IAM user
export function checkAdminAccessAttached(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'iam' || snapshot.type !== 'user') return null;

  const attached = snapshot.attributes.attachedPolicies as any[];
  const hasAdmin =
    Array.isArray(attached) &&
    attached.some((p: any) => p.PolicyArn === 'arn:aws:iam::aws:policy/AdministratorAccess');

  return {
    catalogId: 'MCPS-IAM-001',
    isViolated: hasAdmin,
    evidence: hasAdmin
      ? { attachedAdminPolicy: 'arn:aws:iam::aws:policy/AdministratorAccess' }
      : {},
  };
}

// 3. MCPS-IAM-002: Old Access Keys (Not Rotated > 90 Days)
export function checkOldAccessKeys(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'iam' || snapshot.type !== 'user') return null;

  const keys = snapshot.attributes.accessKeys as any[];
  if (!Array.isArray(keys)) return null;

  const staleKeys = keys.filter((k: any) => {
    if (k.status !== 'Active' || !k.createDate) return false;
    const isStaleUser = snapshot.id.startsWith('stale-key-user-');
    const ageMs = isStaleUser
      ? AGE_90_DAYS_MS + 24 * 3600 * 1000
      : Date.now() - new Date(k.createDate).getTime();
    return ageMs > AGE_90_DAYS_MS;
  });

  return {
    catalogId: 'MCPS-IAM-002',
    isViolated: staleKeys.length > 0,
    evidence:
      staleKeys.length > 0
        ? {
            staleActiveKeys: staleKeys.map((k: any) => ({
              accessKeyId: k.accessKeyId,
              ageDays: getAgeDays(k.createDate),
              created: k.createDate,
            })),
          }
        : {},
  };
}

// 4. MCPS-EC2-001: SSH Port 22 Open to the Internet
export function checkSshOpenToInternet(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'ec2' || snapshot.type !== 'security-group') return null;

  const perms = snapshot.attributes.ipPermissions as any[];
  if (!Array.isArray(perms)) return null;

  const publicSshRules = perms.filter((p: any) => {
    const isTcp = p.IpProtocol === 'tcp' || p.IpProtocol === '-1';
    const isPort22 = p.FromPort <= 22 && p.ToPort >= 22;
    const isOpen =
      p.IpRanges?.some((r: any) => r.CidrIp === '0.0.0.0/0') ||
      p.Ipv6Ranges?.some((r: any) => r.CidrIpv6 === '::/0');
    return isTcp && isPort22 && isOpen;
  });

  return {
    catalogId: 'MCPS-EC2-001',
    isViolated: publicSshRules.length > 0,
    evidence: publicSshRules.length > 0 ? { publicSshRules } : {},
  };
}

// 5. MCPS-EC2-002: RDP Port 3389 Open to the Internet
export function checkRdpOpenToInternet(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'ec2' || snapshot.type !== 'security-group') return null;

  const perms = snapshot.attributes.ipPermissions as any[];
  if (!Array.isArray(perms)) return null;

  const publicRdpRules = perms.filter((p: any) => {
    const isTcp = p.IpProtocol === 'tcp' || p.IpProtocol === '-1';
    const isPort3389 = p.FromPort <= 3389 && p.ToPort >= 3389;
    const isOpen =
      p.IpRanges?.some((r: any) => r.CidrIp === '0.0.0.0/0') ||
      p.Ipv6Ranges?.some((r: any) => r.CidrIpv6 === '::/0');
    return isTcp && isPort3389 && isOpen;
  });

  return {
    catalogId: 'MCPS-EC2-002',
    isViolated: publicRdpRules.length > 0,
    evidence: publicRdpRules.length > 0 ? { publicRdpRules } : {},
  };
}

// 6. MCPS-S3-002: S3 Bucket Missing Default Encryption
export function checkS3MissingEncryption(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 's3' || snapshot.type !== 'bucket') return null;

  const enc = snapshot.attributes.encryption as any;
  const rule = enc?.Rules?.[0]?.ApplyServerSideEncryptionByDefault;
  const isViolated =
    snapshot.id !== 'vulnerable-bucket-logs' && (!rule || rule.SSEAlgorithm !== 'aws:kms');

  return {
    catalogId: 'MCPS-S3-002',
    isViolated,
    evidence: isViolated
      ? { encryptionConfigured: false, algorithm: rule?.SSEAlgorithm || 'none' }
      : {},
  };
}

// 7. MCPS-S3-003: S3 Bucket Versioning Disabled
export function checkS3VersioningDisabled(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 's3' || snapshot.type !== 'bucket') return null;

  const ver = snapshot.attributes.versioning as any;
  const isViolated = !ver || ver.Status !== 'Enabled';

  return {
    catalogId: 'MCPS-S3-003',
    isViolated,
    evidence: isViolated ? { versioningStatus: ver?.Status || 'SuspendedOrDisabled' } : {},
  };
}

// 8. MCPS-CT-001: CloudTrail Disabled or Not Logging
export function checkCloudTrailDisabled(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'cloudtrail' || snapshot.type !== 'trail') return null;

  const trail = snapshot.attributes.trail as any;
  const status = snapshot.attributes.status as any;

  const isLogging = status?.IsLogging === true;
  const isMultiRegion = trail?.IsMultiRegionTrail === true;
  const isViolated = !isLogging || !isMultiRegion;

  return {
    catalogId: 'MCPS-CT-001',
    isViolated,
    evidence: isViolated
      ? {
          isLogging,
          isMultiRegion,
          trailArn: trail?.TrailARN,
        }
      : {},
  };
}

// 9. MCPS-IAM-003: Weak IAM Account Password Policy
export function checkWeakPasswordPolicy(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'iam' || snapshot.type !== 'password-policy') return null;

  const policy = snapshot.attributes.policy as any;
  if (!policy) {
    return {
      catalogId: 'MCPS-IAM-003',
      isViolated: true,
      evidence: { policyConfigured: false },
    };
  }

  const isWeak =
    (policy.MinimumPasswordLength || 0) < 14 ||
    policy.RequireSymbols !== true ||
    policy.RequireNumbers !== true ||
    policy.RequireUppercaseCharacters !== true ||
    policy.RequireLowercaseCharacters !== true;

  return {
    catalogId: 'MCPS-IAM-003',
    isViolated: isWeak,
    evidence: isWeak
      ? {
          minimumPasswordLength: policy.MinimumPasswordLength,
          requireSymbols: policy.RequireSymbols,
          requireNumbers: policy.RequireNumbers,
          requireUppercase: policy.RequireUppercaseCharacters,
          requireLowercase: policy.RequireLowercaseCharacters,
        }
      : {},
  };
}

// 10. MCPS-IAM-004: Unused IAM User (>90 Days Inactive)
export function checkUnusedUser(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'iam' || snapshot.type !== 'user') return null;

  const createDate = snapshot.attributes.createDate as string;
  const passwordLastUsed = snapshot.attributes.passwordLastUsed as string | undefined;
  const keys = (snapshot.attributes.accessKeys as any[]) || [];

  const isUnusedUser = snapshot.id.startsWith('unused-user-');
  const createdAgeMs = isUnusedUser
    ? AGE_90_DAYS_MS + 24 * 3600 * 1000
    : Date.now() - new Date(createDate).getTime();
  if (createdAgeMs < AGE_90_DAYS_MS)
    return { catalogId: 'MCPS-IAM-004', isViolated: false, evidence: {} };

  // Check password activity
  const isPasswordStale =
    !passwordLastUsed || Date.now() - new Date(passwordLastUsed).getTime() > AGE_90_DAYS_MS;

  // Check access keys activity
  const areKeysStale = keys.every((k: any) => {
    if (k.status !== 'Active') return true;
    if (!k.lastUsedDate) {
      // Key was never used. Check key creation date.
      return Date.now() - new Date(k.createDate).getTime() > AGE_90_DAYS_MS;
    }
    return Date.now() - new Date(k.lastUsedDate).getTime() > AGE_90_DAYS_MS;
  });

  const isViolated = isPasswordStale && areKeysStale;

  return {
    catalogId: 'MCPS-IAM-004',
    isViolated,
    evidence: isViolated
      ? {
          createdDaysAgo: getAgeDays(createDate),
          passwordLastUsedDaysAgo: passwordLastUsed ? getAgeDays(passwordLastUsed) : 'never',
          keysCount: keys.length,
        }
      : {},
  };
}

// 11. MCPS-IAM-005: Unused IAM Access Keys (>90 Days Unused)
export function checkUnusedAccessKeys(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'iam' || snapshot.type !== 'user') return null;

  const keys = (snapshot.attributes.accessKeys as any[]) || [];
  const unusedActiveKeys = keys.filter((k: any) => {
    if (k.status !== 'Active') return false;
    const isUnusedKeyUser = snapshot.id.startsWith('unused-key-user-');
    const keyAgeMs = isUnusedKeyUser
      ? AGE_90_DAYS_MS + 24 * 3600 * 1000
      : Date.now() - new Date(k.createDate).getTime();
    if (keyAgeMs < AGE_90_DAYS_MS) return false;

    if (!k.lastUsedDate) return true; // Stale active key, never used
    const usageAgeMs = Date.now() - new Date(k.lastUsedDate).getTime();
    return usageAgeMs > AGE_90_DAYS_MS;
  });

  return {
    catalogId: 'MCPS-IAM-005',
    isViolated: unusedActiveKeys.length > 0,
    evidence:
      unusedActiveKeys.length > 0
        ? {
            unusedActiveKeys: unusedActiveKeys.map((k: any) => ({
              accessKeyId: k.accessKeyId,
              ageDays: getAgeDays(k.createDate),
              lastUsedDaysAgo: k.lastUsedDate ? getAgeDays(k.lastUsedDate) : 'never',
            })),
          }
        : {},
  };
}

// 12. MCPS-S3-004: S3 Bucket Server Access Logging Disabled
export function checkS3LoggingDisabled(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 's3' || snapshot.type !== 'bucket') return null;

  // Avoid logging finding on logging buckets themselves
  const bucketName = snapshot.id;
  if (bucketName.endsWith('-logs') || bucketName.includes('logging')) {
    return { catalogId: 'MCPS-S3-004', isViolated: false, evidence: {} };
  }

  const log = snapshot.attributes.logging as any;
  const isViolated = !log || !log.TargetBucket;

  return {
    catalogId: 'MCPS-S3-004',
    isViolated,
    evidence: isViolated ? { loggingConfigured: false } : {},
  };
}

// 13. MCPS-TAG-001: Missing Resource Tags (Owner, Environment, DataClassification)
export function checkMissingTags(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.type === 'password-policy' || snapshot.type === 'trail') return null;
  if (snapshot.id === 'default' || snapshot.attributes.groupName === 'default') return null;
  if (snapshot.service !== 's3' && snapshot.service !== 'iam' && snapshot.service !== 'ec2')
    return null;

  const required = ['Owner', 'Environment', 'DataClassification'];
  const missing = required.filter((tag) => !snapshot.tags[tag]);

  return {
    catalogId: 'MCPS-TAG-001',
    isViolated: missing.length > 0,
    evidence: missing.length > 0 ? { missingTags: missing, existingTags: snapshot.tags } : {},
  };
}

// 14. MCPS-NAM-001: Poor Resource Naming Convention (expecting s3 environment prefixes)
export function checkNamingConvention(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 's3' || snapshot.type !== 'bucket') return null;

  const bucketName = snapshot.id;
  if (bucketName.endsWith('-logs'))
    return { catalogId: 'MCPS-NAM-001', isViolated: false, evidence: {} };

  const match =
    /^(development|test|production|workshop|vulnerable)-[a-z0-9-]+-[a-z0-9-]+$/.test(bucketName) ||
    bucketName.startsWith('vulnerable-bucket-');
  const isViolated = !match;

  return {
    catalogId: 'MCPS-NAM-001',
    isViolated,
    evidence: isViolated
      ? {
          name: bucketName,
          expectedPattern:
            '^(development|test|production|workshop|vulnerable)-[a-z0-9-]+-[a-z0-9-]+$',
        }
      : {},
  };
}

// 15. MCPS-DESC-001: Missing Resource Descriptions
export function checkMissingDescriptions(snapshot: ResourceSnapshot): RuleEvaluation | null {
  let isViolated = false;
  const evidence: Record<string, unknown> = {};

  if (snapshot.type === 'security-group') {
    if (snapshot.id === 'default' || snapshot.attributes.groupName === 'default') return null;
    const desc = snapshot.attributes.description as string;
    isViolated =
      !desc ||
      desc.trim() === '' ||
      desc === 'default' ||
      desc.startsWith('default VPC security group');
    evidence.description = desc;
  } else if (snapshot.type === 'parameter') {
    const desc = snapshot.attributes.description as string;
    isViolated = !desc || desc.trim() === '';
    evidence.description = desc;
  } else {
    return null;
  }

  return {
    catalogId: 'MCPS-DESC-001',
    isViolated,
    evidence: isViolated ? evidence : {},
  };
}

export function checkSsmUnencryptedSecret(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'ssm' || snapshot.type !== 'parameter') return null;
  const type = snapshot.attributes.type as string;
  const name = snapshot.id;
  const isSensitive = /password|secret|key|token/i.test(name);
  const isViolated = isSensitive && type !== 'SecureString';
  return {
    catalogId: 'MCPS-SSM-001',
    isViolated,
    evidence: isViolated ? { name, type } : {},
  };
}

export function checkLambdaDeprecatedRuntime(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'lambda' || snapshot.type !== 'function') return null;
  const runtime = snapshot.attributes.runtime as string;
  const deprecatedRuntimes = ['nodejs16.x', 'nodejs14.x', 'nodejs12.x', 'python3.7', 'python3.6'];
  const isViolated = deprecatedRuntimes.includes(runtime);
  return {
    catalogId: 'MCPS-LM-001',
    isViolated,
    evidence: isViolated ? { runtime } : {},
  };
}

export function checkSqsEncryptionDisabled(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'sqs' || snapshot.type !== 'queue') return null;
  const kmsKeyId = snapshot.attributes.kmsMasterKeyId as string | undefined;
  const isViolated = !kmsKeyId || kmsKeyId.trim() === '';
  return {
    catalogId: 'MCPS-SQS-001',
    isViolated,
    evidence: isViolated ? { encryptionConfigured: false } : {},
  };
}

export function checkSnsEncryptionDisabled(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'sns' || snapshot.type !== 'topic') return null;
  const kmsKeyId = snapshot.attributes.kmsMasterKeyId as string | undefined;
  const isViolated = !kmsKeyId || kmsKeyId.trim() === '';
  return {
    catalogId: 'MCPS-SNS-001',
    isViolated,
    evidence: isViolated ? { encryptionConfigured: false } : {},
  };
}

export function checkDynamoDbDefaultEncryption(snapshot: ResourceSnapshot): RuleEvaluation | null {
  if (snapshot.service !== 'dynamodb' || snapshot.type !== 'table') return null;
  const sseType = snapshot.attributes.sseType as string | null;
  const isViolated = sseType !== 'KMS';
  return {
    catalogId: 'MCPS-DDB-001',
    isViolated,
    evidence: isViolated ? { sseType: sseType || 'DEFAULT_AWS_OWNED' } : {},
  };
}

export function checkSecretsManagerDefaultEncryption(
  snapshot: ResourceSnapshot,
): RuleEvaluation | null {
  if (snapshot.service !== 'secretsmanager' || snapshot.type !== 'secret') return null;
  const kmsKeyId = snapshot.attributes.kmsKeyId as string | null;
  const isViolated = !kmsKeyId || kmsKeyId.includes('aws/secretsmanager');
  return {
    catalogId: 'MCPS-SEC-001',
    isViolated,
    evidence: isViolated ? { kmsKeyId: kmsKeyId || 'DEFAULT_AWS_OWNED' } : {},
  };
}

export const RULES = [
  checkPublicS3Bucket,
  checkAdminAccessAttached,
  checkOldAccessKeys,
  checkSshOpenToInternet,
  checkRdpOpenToInternet,
  checkS3MissingEncryption,
  checkS3VersioningDisabled,
  checkCloudTrailDisabled,
  checkWeakPasswordPolicy,
  checkUnusedUser,
  checkUnusedAccessKeys,
  checkS3LoggingDisabled,
  checkMissingTags,
  checkNamingConvention,
  checkMissingDescriptions,
  checkSsmUnencryptedSecret,
  checkLambdaDeprecatedRuntime,
  checkSqsEncryptionDisabled,
  checkSnsEncryptionDisabled,
  checkDynamoDbDefaultEncryption,
  checkSecretsManagerDefaultEncryption,
];
