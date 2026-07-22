# Least-privilege IAM for MCPShield

Use **separate roles** for scan (read) and remediate (write) when possible. The current app uses one credential set for both — start with the read policy and only attach write when remediation is enabled.

## Scan role (read-only)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MCPShieldScanRead",
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets",
        "s3:GetBucket*",
        "s3:GetPublicAccessBlock",
        "s3:GetEncryptionConfiguration",
        "s3:GetBucketVersioning",
        "s3:GetBucketLogging",
        "s3:GetBucketTagging",
        "s3:GetBucketAcl",
        "s3:GetBucketPolicy",
        "iam:ListUsers",
        "iam:ListAccessKeys",
        "iam:GetAccessKeyLastUsed",
        "iam:ListAttachedUserPolicies",
        "iam:ListUserPolicies",
        "iam:GetAccountPasswordPolicy",
        "iam:GetUser",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeInstances",
        "lambda:ListFunctions",
        "lambda:GetFunction",
        "cloudtrail:DescribeTrails",
        "cloudtrail:GetTrailStatus",
        "sqs:ListQueues",
        "sqs:GetQueueAttributes",
        "sns:ListTopics",
        "sns:GetTopicAttributes",
        "dynamodb:ListTables",
        "dynamodb:DescribeTable",
        "ssm:DescribeParameters",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "secretsmanager:ListSecrets",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "*"
    }
  ]
}
```

## Remediate role (write — attach only when HITL execute is enabled)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MCPShieldRemediate",
      "Effect": "Allow",
      "Action": [
        "s3:PutPublicAccessBlock",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketVersioning",
        "s3:PutBucketLogging",
        "s3:PutBucketTagging",
        "iam:DetachUserPolicy",
        "iam:UpdateAccessKey",
        "iam:DeleteAccessKey",
        "iam:DeleteUser",
        "iam:UpdateAccountPasswordPolicy",
        "ec2:RevokeSecurityGroupIngress",
        "cloudtrail:StartLogging",
        "ssm:PutParameter",
        "sqs:SetQueueAttributes",
        "sns:SetTopicAttributes",
        "dynamodb:UpdateTable",
        "secretsmanager:UpdateSecret"
      ],
      "Resource": "*"
    }
  ]
}
```

## Recommendations

1. Prefer an **instance role / IRSA / ECS task role** over long-lived access keys.
2. Scope `Resource` ARNs to known accounts/prefixes when you know the target footprint.
3. Restrict Slack with `SLACK_ALLOWED_CHANNEL` so only a controlled channel can approve remediations.
4. Require `API_KEY` and `MCP_API_KEY` in production; never expose MCP port `7801` publicly.
5. Leave `LOCALSTACK_ENDPOINT` empty for real AWS (see `docker-compose.prod.yml`).
