const API_BASE = '';

const FINDINGS_CATALOG = {
  'MCPS-S3-001': {
    businessImpact:
      'Sensitive customer or corporate data can be exfiltrated by anyone, leading to breach notifications, regulatory fines, and brand loss.',
    technicalImpact:
      'Anonymous principals can list and download objects, enabling data theft, tampering, or malicious content hosting.',
    attackScenario:
      'An attacker scans for open buckets, locates bucket name, and downloads private spreadsheet files without authentication.',
    bestPractice:
      'Enable S3 Block Public Access at the bucket level and remove any public policies or ACLs.',
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
  'MCPS-IAM-001': {
    businessImpact:
      'Compromise of this user credential yields full control of the cloud account, enabling data deletion, ransomware, and billing abuse.',
    technicalImpact:
      'The user can perform any action on any resource, including deleting logs, disabling CloudTrail, and creating backdoor users.',
    attackScenario:
      'An access key for this user leaks in a git commit. The attacker uses it to spin up GPU miners and delete production databases.',
    bestPractice:
      'Manage access using groups or roles. Never attach policies directly to individual IAM users.',
    terraform: `# Remove direct policy attachment from resource definitions
# (Manage user rights via Group membership instead)
# resource "aws_iam_user_policy_attachment" "{{resourceId}}_admin" {
#   user       = "{{userName}}"
#   policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
# }`,
    awsCli: `aws --endpoint-url {{endpoint}} iam detach-user-policy \\
  --user-name {{userName}} \\
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`,
  },
  'MCPS-IAM-002': {
    businessImpact:
      'Long-lived credentials are more likely to leak over time (laptops, backups, configurations), presenting a permanent access risk.',
    technicalImpact:
      'Active credentials remain valid indefinitely, exposing the account if the key has been leaked or cached.',
    attackScenario:
      'An engineer leaves the company but retains local credentials that were never rotated; they are used to access database snapshots.',
    bestPractice:
      'Enforce access key rotation policies of 90 days or less. Prefer temporary role credentials.',
    terraform: `# Key rotation is operational. Deactivate the stale key, create a new key,
# configure consumers, and then delete the old key:
# aws iam update-access-key --access-key-id {{accessKeyId}} --status Inactive`,
    awsCli: `# 1) Deactivate the stale access key
aws --endpoint-url {{endpoint}} iam update-access-key \\
  --user-name {{userName}} --access-key-id {{accessKeyId}} --status Inactive
# 2) Generate replacement key, update application, and delete the stale key
aws --endpoint-url {{endpoint}} iam create-access-key --user-name {{userName}}`,
  },
  'MCPS-EC2-001': {
    businessImpact:
      'Exposing management ports to the world invites constant automated brute-force attacks and scans for unpatched exploits.',
    technicalImpact:
      'Allows anyone on the internet to attempt SSH authentication, creating code execution opportunities if SSH daemon is vulnerable.',
    attackScenario:
      'A botnet scans for open port 22, performs credential brute-forcing, gains shell access, and installs malware.',
    bestPractice:
      'Restrain SSH access to known corporate CIDR blocks or use AWS Systems Manager Session Manager.',
    terraform: `resource "aws_security_group_rule" "{{resourceId}}_revoke_ssh" {
  type              = "ingress"
  security_group_id = "{{sgId}}"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/8"]
}`,
    awsCli: `aws --endpoint-url {{endpoint}} ec2 revoke-security-group-ingress \\
  --group-id {{sgId}} --protocol tcp --port 22 --cidr 0.0.0.0/0`,
  },
  'MCPS-EC2-002': {
    businessImpact:
      'Public RDP servers are prime targets for ransomware operators who use compromised endpoints to lock network drives.',
    technicalImpact:
      'Exposes Windows login interface to internet scanners, increasing risk of brute-forcing or BlueKeep style RCE.',
    attackScenario:
      'An attacker detects port 3389, runs an RDP exploit to bypass authentication, and deploys locker payloads.',
    bestPractice:
      'Restrain port 3389 ingress to trusted IP ranges or run behind a Client VPN / Bastion host.',
    terraform: `resource "aws_security_group_rule" "{{resourceId}}_revoke_rdp" {
  type              = "ingress"
  security_group_id = "{{sgId}}"
  from_port         = 3389
  to_port           = 3389
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/8"]
}`,
    awsCli: `aws --endpoint-url {{endpoint}} ec2 revoke-security-group-ingress \\
  --group-id {{sgId}} --protocol tcp --port 3389 --cidr 0.0.0.0/0`,
  },
  'MCPS-S3-002': {
    businessImpact:
      'Failing to encrypt data at rest violates core standards (HIPAA/PCI DSS) and risks regulatory fines if physical disks are breached.',
    technicalImpact:
      'Objects are written to storage in plaintext. Access to the underlying physical layers exposes all corporate files.',
    bestPractice:
      'Configure default bucket server-side encryption to AES256 or use AWS KMS customer keys.',
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
  'MCPS-S3-003': {
    businessImpact:
      'Without versioning, objects accidentally deleted or overwritten by application bugs are permanently unrecoverable.',
    technicalImpact:
      'A delete request permanently destroys the targeted object version; recovery requires restored backups.',
    bestPractice:
      'Enable bucket versioning to ensure deleted or overwritten objects can be recovered from version history.',
    terraform: `resource "aws_s3_bucket_versioning" "{{resourceId}}" {
  bucket = "{{bucket}}"
  versioning_configuration {
    status = "Enabled"
  }
}`,
    awsCli: `aws --endpoint-url {{endpoint}} s3api put-bucket-versioning \\
  --bucket {{bucket}} --versioning-configuration Status=Enabled`,
  },
  'MCPS-CT-001': {
    businessImpact:
      'Without audit logs, security responders cannot trace when, who, or how a resource was modified during a breach.',
    technicalImpact:
      'Removes the primary forensic and log trail of API activities in the AWS account.',
    bestPractice:
      'Configure at least one multi-region CloudTrail, delivering logs to a dedicated S3 bucket.',
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
  'MCPS-IAM-003': {
    businessImpact:
      'Weak password policies invite dictionary attacks against the AWS console, potentially leading to administrative takeover.',
    technicalImpact:
      'Allows users to configure simple, short, or reusable passwords, lowering authorization resistance.',
    bestPractice:
      'Configure an account password policy enforcing a minimum length of 14, complexity, and reuse prevention.',
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
  'MCPS-IAM-004': {
    businessImpact:
      'Forgotten, inactive identities represent a static attack surface that is rarely audited, making them ideal targets.',
    technicalImpact:
      'The identity retains programmatic access keys or console passwords that can be abused without notice.',
    bestPractice:
      'Disable or delete users that have not authenticated or used credentials within the last 90 days.',
    terraform: `# Delete the unused user profile from configurations
# (Ensure keys and profile attachments are revoked first)
# (Terraform will delete the user on apply)`,
    awsCli: `# Detach login credentials, then delete the user:
aws --endpoint-url {{endpoint}} iam delete-login-profile --user-name {{userName}} || true
aws --endpoint-url {{endpoint}} iam delete-user --user-name {{userName}}`,
  },
  'MCPS-IAM-005': {
    businessImpact:
      'Active, unused programmatic access keys represent a standing risk that can be leaked through backups or compromised files.',
    technicalImpact:
      'An active credentials key remains capable of authorizing programmatic requests to the account.',
    bestPractice:
      'Deactivate and delete any IAM access keys that have not recorded usage in the last 90 days.',
    terraform: `# Deactivate the key by running an update status call:
# aws iam update-access-key --user-name {{userName}} --access-key-id {{accessKeyId}} --status Inactive`,
    awsCli: `aws --endpoint-url {{endpoint}} iam update-access-key \\
  --user-name {{userName}} --access-key-id {{accessKeyId}} --status Inactive`,
  },
  'MCPS-S3-004': {
    businessImpact:
      'Failing to record read/write requests on storage buckets makes list and download operations invisible, disabling exfiltration forensics.',
    technicalImpact: 'API calls to download objects do not emit logs to server access logs.',
    bestPractice:
      'Configure S3 Server Access Logging to deliver request logs to a dedicated logging bucket.',
    terraform: `resource "aws_s3_bucket_logging" "{{resourceId}}" {
  bucket        = "{{bucket}}"
  target_bucket = "{{bucket}}-logs"
  target_prefix = "s3-access/"
}`,
    awsCli: `aws --endpoint-url {{endpoint}} s3api put-bucket-logging \\
  --bucket {{bucket}} \\
  --bucket-logging-status '{"LoggingEnabled":{"TargetBucket":"{{bucket}}-logs","TargetPrefix":"s3-access/"}}'`,
  },
  'MCPS-TAG-001': {
    businessImpact:
      'Untagged resources cause accounting blindspots, complicate compliance audits, and prevent automated security response rules.',
    technicalImpact:
      'Security automation guardrails cannot identify owner, classification, or environment, bypassing filters.',
    bestPractice:
      'Enforce tags (Owner, Environment, DataClassification) on all provisioned infrastructure.',
    terraform: `# Add tags to the resource declaration:
# tags = { Owner = "security", Environment = "workshop", DataClassification = "internal" }`,
    awsCli: `aws --endpoint-url {{endpoint}} s3api put-bucket-tagging \\
  --bucket {{bucket}} \\
  --tagging 'TagSet=[{Key=Owner,Value=security},{Key=Environment,Value=workshop},{Key=DataClassification,Value=internal}]'`,
  },
  'MCPS-NAM-001': {
    businessImpact:
      'Non-conforming resource names slow operations, increase administrative errors, and violate internal compliance guidelines.',
    technicalImpact: 'Standardized resource parsing scripts fail to group or filter resources.',
    bestPractice: 'Enforce environment-prefixed naming conventions like <env>-<app>-<purpose>.',
    terraform: `# Rename the bucket to follow compliant format:
# (Requires bucket sync + recreation)`,
    awsCli: `# Re-create bucket under compliant name, migrate contents, and delete old:
aws --endpoint-url {{endpoint}} s3 mb s3://workshop-mcpshield-data
aws --endpoint-url {{endpoint}} s3 sync s3://{{bucket}} s3://workshop-mcpshield-data`,
  },
  'MCPS-DESC-001': {
    businessImpact:
      'Missing descriptions slow down review cycles and prevent engineers from identifying the original intent of a resource.',
    technicalImpact:
      'Auditors cannot quickly map security group rules or configuration variables to their business goals.',
    bestPractice:
      'Provide descriptive metadata on all Security Groups and Parameter configurations.',
    terraform: `# Include a description on the resource definition, e.g. for security group:
# description = "Managed by MCPShield — {{resourceType}} for workshop"`,
    awsCli: `aws --endpoint-url {{endpoint}} ssm put-parameter \\
  --name /{{resourceId}}/description --type String \\
  --value "Managed by MCPShield — {{resourceType}}" --overwrite`,
  },
  'MCPS-SSM-001': {
    businessImpact:
      'Unencrypted parameters are readable in plain-text by any user with read permissions, leading to key leakage and account compromise.',
    technicalImpact:
      'Plaintext storage allows easy extraction of API keys, database credentials, and certificates.',
    attackScenario:
      'An attacker gains read access to SSM, prints SSM parameters, and harvests DB passwords stored in cleartext String variables.',
    bestPractice: 'Enforce SecureString parameter types for all credentials and encrypt with KMS.',
    terraform: `resource "aws_ssm_parameter" "{{resourceId}}" {
  name      = "/{{resourceId}}"
  type      = "SecureString"
  value     = "secure-value"
  overwrite = true
}`,
    awsCli: `aws --endpoint-url {{endpoint}} ssm put-parameter --name /{{resourceId}} --type SecureString --value "secure-value" --overwrite`,
  },
  'MCPS-LM-001': {
    businessImpact:
      'Outdated runtimes contain unpatched vulnerabilities, exposing the code execution environment to zero-day remote exploits.',
    technicalImpact:
      'Deprecated runtimes miss critical security patches and performance optimizations.',
    attackScenario:
      'An attacker exploits an unpatched runtime vulnerability on a deprecated engine version to escape the Lambda sandbox.',
    bestPractice: 'Upgrade function runtimes to active, supported versions (e.g. nodejs20.x).',
    terraform: `resource "aws_lambda_function" "{{resourceId}}" {
  function_name = "{{resourceId}}"
  runtime       = "nodejs20.x"
}`,
    awsCli: `aws --endpoint-url {{endpoint}} lambda update-function-configuration --function-name {{resourceId}} --runtime nodejs20.x`,
  },
  'MCPS-SQS-001': {
    businessImpact:
      'Message payloads containing PII, transactions, or credentials are stored in plain text on physical drives, raising compliance risks.',
    technicalImpact:
      'Plaintext drive exposure could allow unauthorized AWS identities to read message contents directly.',
    attackScenario:
      'An attacker intercepts messages stored in the message broker queue backlog which lack KMS protection.',
    bestPractice: 'Enable SQS server-side encryption (SSE) using AWS KMS CMK key.',
    terraform: `resource "aws_sqs_queue" "{{resourceId}}" {
  name                              = "{{resourceId}}"
  kms_master_key_id                 = "alias/aws/sqs"
  kms_data_key_reuse_period_seconds = 300
}`,
    awsCli: `aws --endpoint-url {{endpoint}} sqs set-queue-attributes --queue-url {{endpoint}}/000000000000/{{resourceId}} --attributes KmsMasterKeyId=alias/aws/sqs`,
  },
  'MCPS-SNS-001': {
    businessImpact:
      'Notifications or messages passed through the topic can be read in plain-text if physical disks are exposed, violating confidentiality.',
    technicalImpact:
      'Disks hosting raw SNS pub-sub logs are readable without cryptographic decryption layers.',
    attackScenario:
      'An attacker with disk-level access intercepts raw messaging contents moving through unencrypted topics.',
    bestPractice: 'Enable SNS server-side encryption (SSE) using AWS KMS CMK key.',
    terraform: `resource "aws_sns_topic" "{{resourceId}}" {
  name              = "{{resourceId}}"
  kms_master_key_id = "alias/aws/sns"
}`,
    awsCli: `aws --endpoint-url {{endpoint}} sns set-topic-attributes --topic-arn arn:aws:sns:{{region}}:000000000000:{{resourceId}} --attribute-name KmsMasterKeyId --attribute-value alias/aws/sns`,
  },
  'MCPS-DDB-001': {
    businessImpact:
      'Limits auditing capability of decryption events and prevents granular access control for sensitive database items.',
    technicalImpact:
      'Encryption-at-rest decryption permissions cannot be restricted using custom KMS key policies.',
    attackScenario:
      'An attacker with broad AWS access reads table elements because they cannot be separately blocked by key policies.',
    bestPractice:
      'Encrypt DynamoDB tables with Customer Managed Keys (CMKs) to enable decryption audits.',
    terraform: `resource "aws_dynamodb_table" "{{resourceId}}" {
  name = "{{resourceId}}"
  server_side_encryption {
    enabled     = true
    kms_key_arn = "arn:aws:kms:{{region}}:000000000000:key/custom-key"
  }
}`,
    awsCli: `aws --endpoint-url {{endpoint}} dynamodb update-table --table-name {{resourceId}} --ss-specification Enabled=true,SSEType=KMS,KMSMasterKeyId=arn:aws:kms:{{region}}:000000000000:key/custom-key`,
  },
  'MCPS-SEC-001': {
    businessImpact:
      'Any user with Secrets Manager read access can read the secret value without requiring separate KMS decryption rights.',
    technicalImpact:
      'Bypasses the security depth of requiring two separate IAM permissions (secretsmanager:GetSecretValue and kms:Decrypt).',
    attackScenario:
      'An IAM user with generic Secrets Manager read privileges retrieves database passwords because no custom KMS key policy blocks them.',
    bestPractice:
      'Encrypt all secrets with Customer Managed Keys (CMKs) to enforce dual-layered authorization.',
    terraform: `resource "aws_secretsmanager_secret" "{{resourceId}}" {
  name       = "{{resourceId}}"
  kms_key_id = "arn:aws:kms:{{region}}:000000000000:key/custom-key"
}`,
    awsCli: `aws --endpoint-url {{endpoint}} secretsmanager update-secret --secret-id {{resourceId}} --kms-key-id arn:aws:kms:{{region}}:000000000000:key/custom-key`,
  },
};

let appState = {
  score: { score: 0, grade: '-', breakdown: { critical: 0, high: 0, medium: 0, low: 0 } },
  findings: [],
  activeFinding: null,
  activeFilter: 'all',
  endpoint: 'http://localhost:4566',
};

function setScoreCircle(score) {
  const circle = document.querySelector('.ring-fg');
  if (!circle) return;

  const radius = circle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = offset;

  if (score >= 90) {
    circle.style.stroke = '#10b981';
  } else if (score >= 70) {
    circle.style.stroke = '#fbbf24';
  } else if (score >= 50) {
    circle.style.stroke = '#f97316';
  } else {
    circle.style.stroke = '#ef4444';
  }
}

function renderCodeTemplate(template, finding) {
  if (!template) return '';
  const resourceId = finding.resource.id;
  const safeId = resourceId.replace(/[^a-zA-Z0-9_]/g, '_');

  let out = template;
  out = out.replace(/{{endpoint}}/g, appState.endpoint);
  out = out.replace(/{{region}}/g, finding.resource.region || 'us-east-1');
  out = out.replace(/{{resourceId}}/g, safeId);
  out = out.replace(/{{resourceType}}/g, finding.resource.type);

  if (finding.resource.service === 's3') {
    out = out.replace(/{{bucket}}/g, resourceId);
  }
  if (finding.resource.service === 'iam') {
    out = out.replace(/{{userName}}/g, resourceId);
    let accessKeyId = '';
    if (finding.evidence.accessKeyId) {
      accessKeyId = finding.evidence.accessKeyId;
    } else if (finding.evidence.staleActiveKeys && finding.evidence.staleActiveKeys[0]) {
      accessKeyId = finding.evidence.staleActiveKeys[0].accessKeyId || '';
    } else if (finding.evidence.unusedActiveKeys && finding.evidence.unusedActiveKeys[0]) {
      accessKeyId = finding.evidence.unusedActiveKeys[0].accessKeyId || '';
    }
    out = out.replace(/{{accessKeyId}}/g, accessKeyId);
  }
  if (finding.resource.service === 'ec2') {
    out = out.replace(/{{sgId}}/g, resourceId);
  }
  return out;
}

function selectFinding(finding) {
  appState.activeFinding = finding;

  document.querySelectorAll('.finding-item').forEach((el) => {
    if (el.dataset.id === finding.findingId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  const placeholder = document.getElementById('remediation-placeholder');
  const content = document.getElementById('remediation-content');
  placeholder.classList.add('hidden');
  content.classList.remove('hidden');

  const sevEl = document.getElementById('detail-severity');
  sevEl.className = `badge ${finding.severity}`;
  sevEl.textContent = finding.severity;

  document.getElementById('detail-title').textContent = finding.title;
  document.getElementById('detail-resource').textContent =
    `${finding.resource.service}::${finding.resource.type}/${finding.resource.id}`;

  const catalog = FINDINGS_CATALOG[finding.catalogId] || {
    businessImpact: 'N/A',
    technicalImpact: 'N/A',
    attackScenario: 'N/A',
    bestPractice: 'N/A',
    terraform: '',
    awsCli: '',
  };

  document.getElementById('detail-desc').textContent = finding.description;
  document.getElementById('detail-tech-impact').textContent = catalog.technicalImpact;
  document.getElementById('detail-biz-impact').textContent = catalog.businessImpact;

  const scenarioBox = document.getElementById('detail-scenario');
  if (catalog.attackScenario) {
    scenarioBox.classList.remove('hidden');
    scenarioBox.textContent = `Attack Scenario: ${catalog.attackScenario}`;
  } else {
    scenarioBox.classList.add('hidden');
  }

  document.getElementById('detail-best-practice').textContent = catalog.bestPractice;

  document.getElementById('code-tf').textContent = renderCodeTemplate(catalog.terraform, finding);
  document.getElementById('code-cli').textContent = renderCodeTemplate(catalog.awsCli, finding);
}

function renderFindingsList() {
  const container = document.getElementById('findings-container');
  if (!container) return;

  const filtered = appState.findings.filter((f) => {
    if (appState.activeFilter === 'all') return true;
    return f.severity === appState.activeFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
        <p>No findings match your filter guidelines.</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map((f) => {
      const isActive = appState.activeFinding && appState.activeFinding.findingId === f.findingId;
      return `
      <div class="finding-item ${isActive ? 'active' : ''} ${f.status}" data-id="${f.findingId}">
        <div class="finding-row-1">
          <span class="badge ${f.status === 'resolved' ? 'resolved' : f.severity}">${f.status === 'resolved' ? 'Fixed' : f.severity}</span>
          <span class="finding-service">${f.service.toUpperCase()}</span>
        </div>
        <div class="finding-title">${f.title}</div>
        <div class="finding-resource">${f.resource.type}:${f.resource.id}</div>
      </div>
    `;
    })
    .join('');

  container.querySelectorAll('.finding-item').forEach((el) => {
    el.addEventListener('click', () => {
      const f = appState.findings.find((item) => item.findingId === el.dataset.id);
      if (f) selectFinding(f);
    });
  });
}

async function syncState(forceScan = false) {
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('loading');

  try {
    if (forceScan) {
      console.log('Triggering LocalStack scan from Sync State...');
      await fetch(`${API_BASE}/api/scan`, { method: 'POST' });
    }

    const res = await fetch(`${API_BASE}/api/state`);
    if (!res.ok) throw new Error('API query failed');

    const data = await res.json();

    appState.score = data.score;
    appState.findings = data.findings;
    if (data.lastScan) {
      appState.endpoint = data.lastScan.endpoint;
    }

    document.getElementById('posture-score').textContent = appState.score.score;
    const gradeBadge = document.getElementById('posture-grade');
    gradeBadge.textContent = appState.score.grade;
    gradeBadge.className = `grade-badge grade-${appState.score.grade}`;

    document.getElementById('resources-count').textContent = data.lastScan
      ? data.lastScan.resourcesScanned
      : 0;

    if (data.lastScan && data.lastScan.completedAt) {
      const date = new Date(data.lastScan.completedAt);
      document.getElementById('last-scan-time').textContent =
        date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
    } else {
      document.getElementById('last-scan-time').textContent = 'Never';
    }

    const breakdown = appState.score.breakdown;
    document.getElementById('count-critical').textContent = breakdown.critical;
    document.getElementById('count-high').textContent = breakdown.high;
    document.getElementById('count-medium').textContent = breakdown.medium;
    document.getElementById('count-low').textContent = breakdown.low;

    const resolvedCount = appState.findings.filter((f) => f.status === 'resolved').length;
    document.getElementById('count-resolved').textContent = resolvedCount;

    // Update horizontal bar graph widths
    const max = Math.max(
      breakdown.critical,
      breakdown.high,
      breakdown.medium,
      breakdown.low,
      resolvedCount,
      1,
    );
    document.getElementById('bar-critical').style.width = `${(breakdown.critical / max) * 100}%`;
    document.getElementById('bar-high').style.width = `${(breakdown.high / max) * 100}%`;
    document.getElementById('bar-medium').style.width = `${(breakdown.medium / max) * 100}%`;
    document.getElementById('bar-low').style.width = `${(breakdown.low / max) * 100}%`;
    document.getElementById('bar-resolved').style.width = `${(resolvedCount / max) * 100}%`;

    setScoreCircle(appState.score.score);
    renderFindingsList();

    if (appState.findings.length > 0 && !appState.activeFinding) {
      const firstOpen = appState.findings.find((f) => f.status === 'open') || appState.findings[0];
      if (firstOpen) selectFinding(firstOpen);
    }
  } catch (err) {
    console.error('Error syncing status: ', err);
  } finally {
    refreshBtn.classList.remove('loading');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', () => syncState(true));

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
      appState.activeFilter = btn.dataset.filter;
      renderFindingsList();
    });
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((el) => el.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((el) => el.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`panel-${tabName}`).classList.add('active');
    });
  });

  const bindCopy = (btnId, codeId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const codeText = document.getElementById(codeId).textContent;
      navigator.clipboard.writeText(codeText).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = orig), 1500);
      });
    });
  };
  bindCopy('copy-tf-btn', 'code-tf');
  bindCopy('copy-cli-btn', 'code-cli');

  // Floating Chat Toggle
  const chatToggleBtn = document.getElementById('chat-toggle-btn');
  const chatWidget = document.getElementById('chat-widget');
  const chatCloseBtn = document.getElementById('chat-close-btn');
  chatToggleBtn.addEventListener('click', () => {
    chatWidget.classList.toggle('hidden');
    if (!chatWidget.classList.contains('hidden')) chatInput.focus();
  });
  chatCloseBtn.addEventListener('click', () => chatWidget.classList.add('hidden'));

  // AI Security Analyst Chatbot Implementation
  let chatHistory = [];
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');

  function formatMarkdown(text) {
    let formatted = text;
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
  }

  function appendMessage(sender, content) {
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    msg.innerHTML = `<p>${formatMarkdown(content)}</p>`;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
  }

  async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    const typingEl = appendMessage('assistant typing', '...');

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory }),
      });

      typingEl.remove();

      if (!res.ok) throw new Error('Chat API call failed');
      const data = await res.json();

      appendMessage('assistant', data.content);
      chatHistory.push({ role: 'user', content: text });
      chatHistory.push({ role: 'assistant', content: data.content });

      // If the message triggers changes, reload the state
      const query = text.toLowerCase();
      if (
        query.includes('scan') ||
        query.includes('fix') ||
        query.includes('approve') ||
        query.includes('remediat')
      ) {
        syncState(false);
      }
    } catch (err) {
      typingEl.remove();
      appendMessage(
        'assistant error',
        'Encountered an error communicating with the analyst agent.',
      );
      console.error(err);
    } finally {
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  chatSendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Sync state and run the first scan on page load
  syncState(true);
  setInterval(() => syncState(false), 5000);
});
