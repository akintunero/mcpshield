import type { FindingCatalogEntry } from '@mcpshield/types';

const CIS_V3 = 'CIS AWS Foundations Benchmark v3.0.0';
const WELL_ARCHITECTED = 'AWS Well-Architected Framework (Operational Excellence)';

/**
 * The MCPShield findings catalog. Each entry describes a *class* of
 * misconfiguration independent of any live resource. Scanners in the
 * security-engine instantiate concrete findings from these entries and the
 * generators render the `{{placeholder}}` remediation templates per resource.
 *
 * Placeholders used across templates:
 *   {{bucket}} {{userName}} {{accessKeyId}} {{sgId}} {{region}} {{endpoint}}
 *   {{resourceType}} {{resourceId}}
 */
export const CATALOG: readonly FindingCatalogEntry[] = [
  // ========================= CRITICAL =========================
  {
    id: 'MCPS-S3-001',
    title: 'Public S3 Bucket',
    severity: 'critical',
    service: 's3',
    category: 'Data Protection',
    description:
      'An S3 bucket allows public access via ACLs or bucket policy, or does not enable S3 Block Public Access. Objects may be readable or writable by anyone on the internet.',
    businessImpact:
      'Sensitive customer or corporate data can be exfiltrated by anyone, leading to breach notifications, regulatory fines (GDPR/CCPA), and reputational damage.',
    technicalImpact:
      'Anonymous principals can list and download (and potentially upload/overwrite) objects, enabling data theft, tampering, and hosting of malicious content.',
    attackScenario:
      'An attacker enumerates public buckets with tooling, discovers the bucket name, lists objects, and downloads confidential files without authentication.',
    bestPractice:
      'Enable account-level and bucket-level S3 Block Public Access, remove public ACLs/policies, and grant access only via least-privilege IAM.',
    mitre: [
      { tactic: 'Collection', techniqueId: 'T1530', techniqueName: 'Data from Cloud Storage' },
    ],
    cis: [
      { benchmark: CIS_V3, controlId: '2.1.4', title: 'Ensure S3 Block Public Access is enabled' },
    ],
    baseRiskScore: 98,
    remediation: {
      terraform: `resource "aws_s3_bucket_public_access_block" "{{resourceId}}" {
  bucket                  = "{{bucket}}"
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`,
      awsCli: `aws --endpoint-url {{endpoint}} s3api put-public-access-block \\
  --bucket {{bucket}} \\
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`,
    },
    references: [
      'https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html',
    ],
  },
  {
    id: 'MCPS-IAM-001',
    title: 'AdministratorAccess Attached Directly to IAM User',
    severity: 'critical',
    service: 'iam',
    category: 'Identity & Access Management',
    description:
      'The AWS-managed AdministratorAccess policy is attached directly to an IAM user, granting unrestricted permissions across the account.',
    businessImpact:
      'Compromise of a single user credential yields full control of the cloud account, enabling data destruction, crypto-mining, and complete takeover.',
    technicalImpact:
      'The user can perform any action on any resource, including disabling logging, creating backdoor identities, and deleting data.',
    attackScenario:
      'A phished or leaked access key for this user lets an attacker create new admin users, exfiltrate data, and disable CloudTrail to evade detection.',
    bestPractice:
      'Grant permissions to groups or roles, not users; apply least privilege; require MFA; avoid attaching AdministratorAccess except to break-glass roles.',
    mitre: [
      {
        tactic: 'Privilege Escalation',
        techniqueId: 'T1078.004',
        techniqueName: 'Valid Accounts: Cloud Accounts',
      },
    ],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '1.16',
        title: 'Ensure IAM policies are attached only to groups or roles',
      },
    ],
    baseRiskScore: 95,
    remediation: {
      terraform: `# Detach AdministratorAccess from the user and manage access via a group instead.
# (Terraform manages desired state — remove the direct attachment below.)
# resource "aws_iam_user_policy_attachment" "{{resourceId}}_admin" {
#   user       = "{{userName}}"
#   policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
# }`,
      awsCli: `aws --endpoint-url {{endpoint}} iam detach-user-policy \\
  --user-name {{userName}} \\
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`,
    },
    references: ['https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html'],
  },
  {
    id: 'MCPS-IAM-002',
    title: 'Old IAM Access Keys (Not Rotated)',
    severity: 'critical',
    service: 'iam',
    category: 'Identity & Access Management',
    description:
      'An active IAM access key is older than 90 days and has not been rotated, increasing the window of exposure for leaked credentials.',
    businessImpact:
      'Long-lived credentials that leak (in code, logs, or laptops) can be abused for months undetected, resulting in data loss and unexpected spend.',
    technicalImpact:
      'A stale key remains valid indefinitely, so any prior exposure continues to grant programmatic access to the account.',
    attackScenario:
      'An attacker finds an old access key committed to a public Git repository years ago; because it was never rotated, it still authenticates successfully.',
    bestPractice:
      'Rotate access keys at least every 90 days, prefer short-lived role credentials, and disable unused keys.',
    mitre: [
      {
        tactic: 'Persistence',
        techniqueId: 'T1078.004',
        techniqueName: 'Valid Accounts: Cloud Accounts',
      },
    ],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '1.14',
        title: 'Ensure access keys are rotated every 90 days or less',
      },
    ],
    baseRiskScore: 90,
    remediation: {
      terraform: `# Access-key rotation is an operational task. Deactivate the stale key, then
# create a replacement and update consumers before deleting the old key.
# aws iam update-access-key --access-key-id {{accessKeyId}} --status Inactive`,
      awsCli: `# 1) Deactivate the stale key
aws --endpoint-url {{endpoint}} iam update-access-key \\
  --user-name {{userName}} --access-key-id {{accessKeyId}} --status Inactive
# 2) Create a replacement, update consumers, then delete the old key
aws --endpoint-url {{endpoint}} iam create-access-key --user-name {{userName}}`,
    },
    references: [
      'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
    ],
  },

  // ========================= HIGH =========================
  {
    id: 'MCPS-EC2-001',
    title: 'SSH (Port 22) Open to the Internet',
    severity: 'high',
    service: 'ec2',
    category: 'Network Security',
    description:
      'A security group allows inbound TCP traffic on port 22 from 0.0.0.0/0, exposing SSH to the entire internet.',
    businessImpact:
      'Internet-wide SSH exposure invites brute-force and exploitation attempts that can lead to host compromise and lateral movement.',
    technicalImpact:
      'Any host on the internet can attempt authentication, increasing the risk of credential brute force and exploitation of SSH vulnerabilities.',
    attackScenario:
      'Automated scanners find the open port and launch a credential brute-force or exploit a vulnerable SSH daemon to gain a foothold.',
    bestPractice:
      'Restrict SSH to known CIDR ranges or a bastion/SSM Session Manager; never allow 0.0.0.0/0 on port 22.',
    mitre: [
      { tactic: 'Initial Access', techniqueId: 'T1133', techniqueName: 'External Remote Services' },
      {
        tactic: 'Lateral Movement',
        techniqueId: 'T1021.004',
        techniqueName: 'Remote Services: SSH',
      },
    ],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '5.2',
        title: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 22',
      },
    ],
    baseRiskScore: 82,
    remediation: {
      terraform: `resource "aws_security_group_rule" "{{resourceId}}_revoke_ssh" {
  type              = "ingress"
  security_group_id = "{{sgId}}"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/8"] # restrict to trusted range instead of 0.0.0.0/0
}`,
      awsCli: `aws --endpoint-url {{endpoint}} ec2 revoke-security-group-ingress \\
  --group-id {{sgId}} --protocol tcp --port 22 --cidr 0.0.0.0/0`,
    },
    references: ['https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'],
  },
  {
    id: 'MCPS-EC2-002',
    title: 'RDP (Port 3389) Open to the Internet',
    severity: 'high',
    service: 'ec2',
    category: 'Network Security',
    description:
      'A security group allows inbound TCP traffic on port 3389 from 0.0.0.0/0, exposing Windows RDP to the entire internet.',
    businessImpact:
      'Publicly exposed RDP is a leading ransomware entry vector; compromise can halt operations and trigger extortion.',
    technicalImpact:
      'Attackers can brute-force RDP credentials or exploit RDP vulnerabilities (e.g. BlueKeep-class) to gain remote code execution.',
    attackScenario:
      'A ransomware operator scans for open 3389, brute-forces weak credentials, and deploys ransomware across the environment.',
    bestPractice:
      'Restrict RDP to trusted CIDRs or a bastion; prefer SSM Session Manager; never allow 0.0.0.0/0 on port 3389.',
    mitre: [
      { tactic: 'Initial Access', techniqueId: 'T1133', techniqueName: 'External Remote Services' },
      {
        tactic: 'Lateral Movement',
        techniqueId: 'T1021.001',
        techniqueName: 'Remote Services: Remote Desktop Protocol',
      },
    ],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '5.3',
        title: 'Ensure no security groups allow ingress from 0.0.0.0/0 to port 3389',
      },
    ],
    baseRiskScore: 80,
    remediation: {
      terraform: `resource "aws_security_group_rule" "{{resourceId}}_revoke_rdp" {
  type              = "ingress"
  security_group_id = "{{sgId}}"
  from_port         = 3389
  to_port           = 3389
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/8"] # restrict to trusted range instead of 0.0.0.0/0
}`,
      awsCli: `aws --endpoint-url {{endpoint}} ec2 revoke-security-group-ingress \\
  --group-id {{sgId}} --protocol tcp --port 3389 --cidr 0.0.0.0/0`,
    },
    references: ['https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'],
  },
  {
    id: 'MCPS-S3-002',
    title: 'S3 Bucket Missing Default Encryption',
    severity: 'high',
    service: 's3',
    category: 'Data Protection',
    description:
      'An S3 bucket does not enforce server-side encryption (SSE-S3 or SSE-KMS) for objects at rest.',
    businessImpact:
      'Unencrypted data at rest can violate compliance requirements (PCI DSS, HIPAA) and increases breach impact if storage is accessed.',
    technicalImpact:
      'Objects are stored in plaintext at rest; any storage-layer exposure yields readable data.',
    attackScenario:
      'An attacker with storage-layer or backup access reads object contents directly because they are not encrypted.',
    bestPractice:
      'Enable default bucket encryption (SSE-KMS preferred) and deny unencrypted uploads via bucket policy.',
    mitre: [
      { tactic: 'Collection', techniqueId: 'T1530', techniqueName: 'Data from Cloud Storage' },
    ],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '2.1.1',
        title: 'Ensure S3 bucket server-side encryption is enabled',
      },
    ],
    baseRiskScore: 72,
    remediation: {
      terraform: `resource "aws_s3_bucket_server_side_encryption_configuration" "{{resourceId}}" {
  bucket = "{{bucket}}"
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}`,
      awsCli: `aws --endpoint-url {{endpoint}} s3api put-bucket-encryption \\
  --bucket {{bucket}} \\
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'`,
    },
    references: ['https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-encryption.html'],
  },
  {
    id: 'MCPS-S3-003',
    title: 'S3 Bucket Versioning Disabled',
    severity: 'high',
    service: 's3',
    category: 'Data Protection',
    description:
      'An S3 bucket does not have versioning enabled, so overwritten or deleted objects cannot be recovered.',
    businessImpact:
      'Accidental or malicious deletion/overwrite is unrecoverable, risking permanent data loss and failed audits.',
    technicalImpact:
      'Without versioning, ransomware or fat-finger deletes permanently destroy object data; no rollback is possible.',
    attackScenario:
      'An attacker with write access overwrites objects with encrypted copies; with versioning off, the originals are gone.',
    bestPractice:
      'Enable bucket versioning (and optionally MFA delete) to protect against overwrite and deletion.',
    mitre: [
      { tactic: 'Impact', techniqueId: 'T1490', techniqueName: 'Inhibit System Recovery' },
      { tactic: 'Impact', techniqueId: 'T1485', techniqueName: 'Data Destruction' },
    ],
    cis: [
      { benchmark: CIS_V3, controlId: '2.1.3', title: 'Ensure S3 bucket versioning is enabled' },
    ],
    baseRiskScore: 70,
    remediation: {
      terraform: `resource "aws_s3_bucket_versioning" "{{resourceId}}" {
  bucket = "{{bucket}}"
  versioning_configuration {
    status = "Enabled"
  }
}`,
      awsCli: `aws --endpoint-url {{endpoint}} s3api put-bucket-versioning \\
  --bucket {{bucket}} --versioning-configuration Status=Enabled`,
    },
    references: ['https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html'],
  },
  {
    id: 'MCPS-CT-001',
    title: 'CloudTrail Disabled or Not Logging',
    severity: 'high',
    service: 'cloudtrail',
    category: 'Logging & Monitoring',
    description:
      'No multi-region CloudTrail trail is enabled and logging, so API activity across the account is not recorded.',
    businessImpact:
      'Without an audit trail, incidents cannot be investigated, compliance fails, and attacker actions go unnoticed.',
    technicalImpact:
      'Management and data events are not captured, eliminating forensic evidence and detection signals.',
    attackScenario:
      'An attacker operates freely knowing their API calls are not logged, making detection and attribution impossible.',
    bestPractice:
      'Enable a multi-region CloudTrail trail delivering to a dedicated, access-logged S3 bucket, and enable log file validation.',
    mitre: [
      {
        tactic: 'Defense Evasion',
        techniqueId: 'T1562.008',
        techniqueName: 'Impair Defenses: Disable or Modify Cloud Logs',
      },
    ],
    cis: [
      { benchmark: CIS_V3, controlId: '3.1', title: 'Ensure CloudTrail is enabled in all regions' },
    ],
    baseRiskScore: 78,
    remediation: {
      terraform: `resource "aws_cloudtrail" "{{resourceId}}" {
  name                          = "mcpshield-trail"
  s3_bucket_name                = "{{bucket}}"
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  include_global_service_events = true
}`,
      awsCli: `aws --endpoint-url {{endpoint}} cloudtrail create-trail \\
  --name mcpshield-trail --s3-bucket-name {{bucket}} --is-multi-region-trail
aws --endpoint-url {{endpoint}} cloudtrail start-logging --name mcpshield-trail`,
    },
    references: [
      'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-a-trail-using-the-cli.html',
    ],
  },

  // ========================= MEDIUM =========================
  {
    id: 'MCPS-IAM-003',
    title: 'Weak IAM Account Password Policy',
    severity: 'medium',
    service: 'iam',
    category: 'Identity & Access Management',
    description:
      'The account password policy does not enforce strong requirements (minimum length >= 14, complexity, reuse prevention).',
    businessImpact:
      'Weak passwords are easily guessed or brute-forced, increasing the likelihood of console compromise.',
    technicalImpact:
      'Short, simple, reusable passwords lower the cost of credential attacks against the AWS console.',
    attackScenario:
      'An attacker brute-forces a console password that is short and lacks complexity, gaining interactive access.',
    bestPractice:
      'Require minimum length 14, symbols, numbers, upper/lowercase, password expiry, and prevent reuse.',
    mitre: [{ tactic: 'Credential Access', techniqueId: 'T1110', techniqueName: 'Brute Force' }],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '1.8',
        title: 'Ensure IAM password policy requires minimum length of 14',
      },
    ],
    baseRiskScore: 52,
    remediation: {
      terraform: `resource "aws_iam_account_password_policy" "strict" {
  minimum_password_length        = 14
  require_symbols                = true
  require_numbers                = true
  require_uppercase_characters   = true
  require_lowercase_characters   = true
  allow_users_to_change_password = true
  password_reuse_prevention      = 24
  max_password_age               = 90
}`,
      awsCli: `aws --endpoint-url {{endpoint}} iam update-account-password-policy \\
  --minimum-password-length 14 --require-symbols --require-numbers \\
  --require-uppercase-characters --require-lowercase-characters \\
  --allow-users-to-change-password --password-reuse-prevention 24 --max-password-age 90`,
    },
    references: [
      'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_account-policy.html',
    ],
  },
  {
    id: 'MCPS-IAM-004',
    title: 'Unused IAM User',
    severity: 'medium',
    service: 'iam',
    category: 'Identity & Access Management',
    description:
      'An IAM user has not authenticated (console or API) within the last 90 days and appears unused.',
    businessImpact:
      'Dormant accounts expand the attack surface and are often overlooked, making them attractive to attackers.',
    technicalImpact:
      'An unused identity retains credentials and permissions that can be abused if compromised.',
    attackScenario:
      'An attacker takes over a forgotten account whose activity nobody monitors, blending in with legitimate identities.',
    bestPractice:
      'Disable or delete users inactive beyond your threshold; review access regularly with IAM credential reports.',
    mitre: [{ tactic: 'Persistence', techniqueId: 'T1078', techniqueName: 'Valid Accounts' }],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '1.12',
        title: 'Ensure credentials unused for 45 days or more are disabled',
      },
    ],
    baseRiskScore: 45,
    remediation: {
      terraform: `# Review and remove the unused user via IAM (destructive — confirm first).
# Consider disabling console access and deactivating keys before deletion.`,
      awsCli: `# Deactivate access, then delete login profile and user after review
aws --endpoint-url {{endpoint}} iam delete-login-profile --user-name {{userName}} || true
aws --endpoint-url {{endpoint}} iam delete-user --user-name {{userName}}`,
    },
    references: [
      'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_getting-report.html',
    ],
  },
  {
    id: 'MCPS-IAM-005',
    title: 'Unused IAM Access Keys',
    severity: 'medium',
    service: 'iam',
    category: 'Identity & Access Management',
    description:
      'An active access key has had no usage recorded within the last 90 days and should be deactivated.',
    businessImpact: 'Idle keys provide standing access that adds risk without operational value.',
    technicalImpact:
      'An unused but active key remains a valid credential that can be leaked and abused.',
    attackScenario:
      'A never-used key stored in an old CI system is discovered and used to access the account.',
    bestPractice:
      'Deactivate and remove access keys with no recent usage; prefer temporary role credentials.',
    mitre: [
      {
        tactic: 'Persistence',
        techniqueId: 'T1078.004',
        techniqueName: 'Valid Accounts: Cloud Accounts',
      },
    ],
    cis: [
      {
        benchmark: CIS_V3,
        controlId: '1.13',
        title: 'Ensure there is only one active access key per user',
      },
    ],
    baseRiskScore: 42,
    remediation: {
      terraform: `# Deactivate the unused key (operational task):
# aws iam update-access-key --user-name {{userName}} --access-key-id {{accessKeyId}} --status Inactive`,
      awsCli: `aws --endpoint-url {{endpoint}} iam update-access-key \\
  --user-name {{userName}} --access-key-id {{accessKeyId}} --status Inactive`,
    },
    references: [
      'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
    ],
  },
  {
    id: 'MCPS-S3-004',
    title: 'S3 Bucket Server Access Logging Disabled',
    severity: 'medium',
    service: 's3',
    category: 'Logging & Monitoring',
    description:
      'An S3 bucket does not have server access logging enabled, reducing visibility into access requests.',
    businessImpact:
      'Without access logs, unauthorized access to objects cannot be investigated or proven for compliance.',
    technicalImpact:
      'Request-level access to the bucket is not recorded, hindering detection and forensics.',
    attackScenario:
      'Data is quietly exfiltrated from the bucket and, lacking access logs, the activity is never detected.',
    bestPractice:
      'Enable S3 server access logging to a dedicated log bucket, or use CloudTrail data events.',
    mitre: [
      {
        tactic: 'Defense Evasion',
        techniqueId: 'T1562.008',
        techniqueName: 'Impair Defenses: Disable or Modify Cloud Logs',
      },
    ],
    cis: [
      { benchmark: CIS_V3, controlId: '3.6', title: 'Ensure S3 bucket access logging is enabled' },
    ],
    baseRiskScore: 40,
    remediation: {
      terraform: `resource "aws_s3_bucket_logging" "{{resourceId}}" {
  bucket        = "{{bucket}}"
  target_bucket = "{{bucket}}-logs"
  target_prefix = "s3-access/"
}`,
      awsCli: `aws --endpoint-url {{endpoint}} s3api put-bucket-logging \\
  --bucket {{bucket}} \\
  --bucket-logging-status '{"LoggingEnabled":{"TargetBucket":"{{bucket}}-logs","TargetPrefix":"s3-access/"}}'`,
    },
    references: ['https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerLogs.html'],
  },

  // ========================= LOW =========================
  {
    id: 'MCPS-TAG-001',
    title: 'Missing Resource Tags',
    severity: 'low',
    service: 's3',
    category: 'Governance',
    description:
      'A resource is missing required governance tags (e.g. Owner, Environment, DataClassification).',
    businessImpact:
      'Untagged resources impede cost allocation, ownership accountability, and automated security response.',
    technicalImpact:
      'Automation and guardrails that key off tags cannot classify or act on the resource.',
    attackScenario:
      'During an incident, responders cannot quickly identify the owner or sensitivity of the resource, slowing containment.',
    bestPractice:
      'Enforce a mandatory tagging policy (Owner, Environment, DataClassification) via SCPs or tag policies.',
    mitre: [
      {
        tactic: 'Discovery',
        techniqueId: 'T1580',
        techniqueName: 'Cloud Infrastructure Discovery',
      },
    ],
    cis: [
      {
        benchmark: WELL_ARCHITECTED,
        controlId: 'OPS-TAG-01',
        title: 'Tag resources for ownership and classification',
      },
    ],
    baseRiskScore: 20,
    remediation: {
      terraform: `# Add required tags to the resource definition, e.g.:
# tags = { Owner = "security", Environment = "workshop", DataClassification = "internal" }`,
      awsCli: `aws --endpoint-url {{endpoint}} s3api put-bucket-tagging \\
  --bucket {{bucket}} \\
  --tagging 'TagSet=[{Key=Owner,Value=security},{Key=Environment,Value=workshop},{Key=DataClassification,Value=internal}]'`,
    },
    references: ['https://docs.aws.amazon.com/general/latest/gr/aws_tagging.html'],
  },
  {
    id: 'MCPS-NAM-001',
    title: 'Poor Resource Naming Convention',
    severity: 'low',
    service: 's3',
    category: 'Governance',
    description:
      'A resource name does not follow the organizational naming convention (e.g. `<env>-<app>-<purpose>`).',
    businessImpact:
      'Inconsistent names slow operations, cause mistakes during changes, and complicate audits.',
    technicalImpact:
      'Ambiguous names increase the chance of acting on the wrong resource and weaken automation matching.',
    attackScenario:
      'An operator mistakes a production bucket for a test bucket due to unclear naming and misapplies a change.',
    bestPractice:
      'Adopt and enforce a consistent naming standard across resources with linting or provisioning guardrails.',
    mitre: [
      {
        tactic: 'Discovery',
        techniqueId: 'T1580',
        techniqueName: 'Cloud Infrastructure Discovery',
      },
    ],
    cis: [
      {
        benchmark: WELL_ARCHITECTED,
        controlId: 'OPS-NAM-01',
        title: 'Use consistent resource naming conventions',
      },
    ],
    baseRiskScore: 15,
    remediation: {
      terraform: `# Rename the resource to follow "<env>-<app>-<purpose>", e.g. "workshop-mcpshield-data".
# Renaming buckets requires create-new + migrate + delete-old.`,
      awsCli: `# Buckets cannot be renamed in place. Create a compliant bucket and migrate:
aws --endpoint-url {{endpoint}} s3 mb s3://workshop-mcpshield-data
aws --endpoint-url {{endpoint}} s3 sync s3://{{bucket}} s3://workshop-mcpshield-data`,
    },
    references: [
      'https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/welcome.html',
    ],
  },
  {
    id: 'MCPS-DESC-001',
    title: 'Missing Resource Descriptions',
    severity: 'low',
    service: 'iam',
    category: 'Governance',
    description:
      'A resource that supports a description/purpose field (e.g. security group, IAM role) has none set.',
    businessImpact:
      'Missing descriptions reduce operational clarity and slow onboarding, reviews, and incident response.',
    technicalImpact:
      'Reviewers cannot quickly determine intent, increasing the risk of leaving risky rules in place.',
    attackScenario:
      'An overly permissive security group rule survives reviews because no one understands its purpose from the (empty) description.',
    bestPractice:
      'Require a meaningful description on resources that support one, stating owner and intended use.',
    mitre: [
      {
        tactic: 'Discovery',
        techniqueId: 'T1580',
        techniqueName: 'Cloud Infrastructure Discovery',
      },
    ],
    cis: [
      {
        benchmark: WELL_ARCHITECTED,
        controlId: 'OPS-DESC-01',
        title: 'Document resource purpose via descriptions',
      },
    ],
    baseRiskScore: 12,
    remediation: {
      terraform: `# Add a description to the resource, e.g. for a security group:
# description = "Managed by MCPShield — {{resourceType}} for workshop"`,
      awsCli: `# Descriptions are set at creation for many resources. For SSM parameters:
aws --endpoint-url {{endpoint}} ssm put-parameter \\
  --name /{{resourceId}}/description --type String \\
  --value "Managed by MCPShield — {{resourceType}}" --overwrite`,
    },
    references: [
      'https://docs.aws.amazon.com/wellarchitected/latest/operational-excellence-pillar/welcome.html',
    ],
  },
  {
    id: 'MCPS-SSM-001',
    title: 'Unencrypted SSM Sensitive Parameter',
    severity: 'high',
    service: 'ssm',
    category: 'Data Protection',
    description: 'An SSM Parameter contains sensitive configurations (password, secret, key, token) but is stored in unencrypted String format instead of SecureString.',
    businessImpact: 'Unencrypted parameters are readable in plain-text by any user or machine with read permissions, leading to key leakage and account compromise.',
    technicalImpact: 'Plaintext storage allows easy extraction of API keys, databases credentials, and certificates.',
    attackScenario: 'An attacker gains read access to SSM, prints SSM parameters, and harvests DB passwords stored in cleartext String variables.',
    bestPractice: 'Enforce SecureString parameter types for all credentials and encrypt with KMS.',
    mitre: [{ tactic: 'Credential Access', techniqueId: 'T1552', techniqueName: 'Unsecured Credentials' }],
    cis: [{ benchmark: WELL_ARCHITECTED, controlId: 'SEC-01', title: 'Encrypt data in transit and at rest' }],
    baseRiskScore: 75,
    remediation: {
      terraform: `resource "aws_ssm_parameter" "{{resourceId}}" {
  name      = "/{{resourceId}}"
  type      = "SecureString"
  value     = "secure-value"
  overwrite = true
}`,
      awsCli: `aws --endpoint-url {{endpoint}} ssm put-parameter --name /{{resourceId}} --type SecureString --value "secure-value" --overwrite`,
    },
    references: ['https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html'],
  },
  {
    id: 'MCPS-LM-001',
    title: 'Lambda Deprecated/Outdated Runtime',
    severity: 'medium',
    service: 'lambda',
    category: 'Application Security',
    description: 'A Lambda function runs on an outdated or deprecated runtime version (e.g. nodejs16.x or older) that no longer receives security updates.',
    businessImpact: 'Outdated runtimes contain unpatched vulnerabilities, exposing the code execution environment to zero-day remote exploits.',
    technicalImpact: 'Deprecated runtimes miss critical performance optimizations and engine-level security patches.',
    attackScenario: 'An attacker exploits an unpatched runtime exploit on a deprecated engine version to escape the Lambda sandbox.',
    bestPractice: 'Upgrade function runtimes to active, supported versions (e.g. nodejs20.x).',
    mitre: [{ tactic: 'Execution', techniqueId: 'T1204', techniqueName: 'User Execution' }],
    cis: [{ benchmark: WELL_ARCHITECTED, controlId: 'SEC-02', title: 'Keep runtimes and libraries up to date' }],
    baseRiskScore: 50,
    remediation: {
      terraform: `resource "aws_lambda_function" "{{resourceId}}" {
  function_name = "{{resourceId}}"
  runtime       = "nodejs20.x"
}`,
      awsCli: `aws --endpoint-url {{endpoint}} lambda update-function-configuration --function-name {{resourceId}} --runtime nodejs20.x`,
    },
    references: ['https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html'],
  },
  {
    id: 'MCPS-SQS-001',
    title: 'SQS Queue Missing Server Encryption',
    severity: 'medium',
    service: 'sqs',
    category: 'Data Protection',
    description: 'An SQS queue does not have server-side encryption enabled to protect messages at rest.',
    businessImpact: 'Message payloads containing PII, transactions, or credentials are stored in plain text on physical drives, raising compliance risks.',
    technicalImpact: 'Plaintext drive exposure could allow third-parties or unauthorized AWS identities to read message contents directly.',
    attackScenario: 'An attacker intercepts messages stored in the message broker queue backlog which lack KMS protection.',
    bestPractice: 'Enable SQS server-side encryption (SSE) using AWS KMS CMK key.',
    mitre: [{ tactic: 'Collection', techniqueId: 'T1056', techniqueName: 'Input Capture' }],
    cis: [{ benchmark: WELL_ARCHITECTED, controlId: 'SEC-03', title: 'Protect data at rest' }],
    baseRiskScore: 48,
    remediation: {
      terraform: `resource "aws_sqs_queue" "{{resourceId}}" {
  name                              = "{{resourceId}}"
  kms_master_key_id                 = "alias/aws/sqs"
  kms_data_key_reuse_period_seconds = 300
}`,
      awsCli: `aws --endpoint-url {{endpoint}} sqs set-queue-attributes --queue-url {{endpoint}}/000000000000/{{resourceId}} --attributes KmsMasterKeyId=alias/aws/sqs`,
    },
    references: ['https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-server-side-encryption.html'],
  },
  {
    id: 'MCPS-SNS-001',
    title: 'SNS Topic Missing Server Encryption',
    severity: 'medium',
    service: 'sns',
    category: 'Data Protection',
    description: 'An SNS topic does not have server-side encryption enabled to protect messages at rest.',
    businessImpact: 'Notifications or messages passed through the topic can be read in plain-text if physical disks are exposed, violating confidentiality.',
    technicalImpact: 'Disks hosting raw SNS pub-sub logs are readable without cryptographic decryption layers.',
    attackScenario: 'An attacker with disk-level access intercepts raw messaging contents moving through unencrypted topics.',
    bestPractice: 'Enable SNS server-side encryption (SSE) using AWS KMS CMK key.',
    mitre: [{ tactic: 'Collection', techniqueId: 'T1056', techniqueName: 'Input Capture' }],
    cis: [{ benchmark: WELL_ARCHITECTED, controlId: 'SEC-03', title: 'Protect data at rest' }],
    baseRiskScore: 45,
    remediation: {
      terraform: `resource "aws_sns_topic" "{{resourceId}}" {
  name              = "{{resourceId}}"
  kms_master_key_id = "alias/aws/sns"
}`,
      awsCli: `aws --endpoint-url {{endpoint}} sns set-topic-attributes --topic-arn arn:aws:sns:{{region}}:000000000000:{{resourceId}} --attribute-name KmsMasterKeyId --attribute-value alias/aws/sns`,
    },
    references: ['https://docs.aws.amazon.com/sns/latest/dg/sns-server-side-encryption.html'],
  },
  {
    id: 'MCPS-DDB-001',
    title: 'DynamoDB Table Missing KMS Customer Key',
    severity: 'medium',
    service: 'dynamodb',
    category: 'Data Protection',
    description: 'A DynamoDB table is encrypted with default AWS-owned keys instead of a customer-managed KMS key (CMK).',
    businessImpact: 'Limits auditing capability of decryption events and prevents granular access control for sensitive database items.',
    technicalImpact: 'Encryption-at-rest decryption permissions cannot be restricted using custom KMS key policies.',
    attackScenario: 'An attacker with broad AWS access reads table elements because they cannot be separately blocked by key policies.',
    bestPractice: 'Encrypt DynamoDB tables with Customer Managed Keys (CMKs) to enable decryption audits.',
    mitre: [{ tactic: 'Collection', techniqueId: 'T1530', techniqueName: 'Data from Cloud Storage' }],
    cis: [{ benchmark: WELL_ARCHITECTED, controlId: 'SEC-03', title: 'Protect data at rest' }],
    baseRiskScore: 40,
    remediation: {
      terraform: `resource "aws_dynamodb_table" "{{resourceId}}" {
  name = "{{resourceId}}"
  server_side_encryption {
    enabled     = true
    kms_key_arn = "arn:aws:kms:{{region}}:000000000000:key/custom-key"
  }
}`,
      awsCli: `aws --endpoint-url {{endpoint}} dynamodb update-table --table-name {{resourceId}} --ss-specification Enabled=true,SSEType=KMS,KMSMasterKeyId=arn:aws:kms:{{region}}:000000000000:key/custom-key`,
    },
    references: ['https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html'],
  },
  {
    id: 'MCPS-SEC-001',
    title: 'Secrets Manager Secret Missing KMS Customer Key',
    severity: 'medium',
    service: 'secretsmanager',
    category: 'Data Protection',
    description: 'A secret in Secrets Manager is encrypted with the default account key instead of a customer-managed KMS key (CMK).',
    businessImpact: 'Any user or role with Secrets Manager read access can read the secret value without requiring separate KMS decryption rights.',
    technicalImpact: 'Bypasses the security depth of requiring two separate IAM permissions (secretsmanager:GetSecretValue and kms:Decrypt).',
    attackScenario: 'An IAM user with generic Secrets Manager read privileges retrieves database passwords because no custom KMS key policy blocks them.',
    bestPractice: 'Encrypt all secrets with Customer Managed Keys (CMKs) to enforce dual-layered authorization.',
    mitre: [{ tactic: 'Credential Access', techniqueId: 'T1552', techniqueName: 'Unsecured Credentials' }],
    cis: [{ benchmark: WELL_ARCHITECTED, controlId: 'SEC-01', title: 'Encrypt data in transit and at rest' }],
    baseRiskScore: 45,
    remediation: {
      terraform: `resource "aws_secretsmanager_secret" "{{resourceId}}" {
  name       = "{{resourceId}}"
  kms_key_id = "arn:aws:kms:{{region}}:000000000000:key/custom-key"
}`,
      awsCli: `aws --endpoint-url {{endpoint}} secretsmanager update-secret --secret-id {{resourceId}} --kms-key-id arn:aws:kms:{{region}}:000000000000:key/custom-key`,
    },
    references: ['https://docs.aws.amazon.com/secretsmanager/latest/userguide/security-encryption.html'],
  },
];
