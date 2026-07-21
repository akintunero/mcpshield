#!/bin/bash
set -euo pipefail

AWS() { aws --endpoint-url=http://localhost:4566 --region=us-east-1 "$@"; }
try() { AWS "$@" 2>/dev/null && echo "  ✅ $*" || echo "  ⚠️  (exists or skipped)"; }
echo "Provisioning MCPShield demo resources..."

# ── STORAGE ──
try s3 mb s3://demo-public-data
AWS s3api put-public-access-block --bucket demo-public-data \
  --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false 2>/dev/null || true
AWS s3api put-bucket-acl --bucket demo-public-data --acl public-read 2>/dev/null || true
try s3 mb s3://demo-encryption-missing
try s3 mb s3://demo-backup
AWS s3api put-public-access-block --bucket demo-backup \
  --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false 2>/dev/null || true

# ── COMPUTE ──
# EC2 security groups
SG1=$(AWS ec2 create-security-group --group-name demo-ssh-open --description "SSH open" --query GroupId --output text 2>/dev/null) || SG1=""
if [ -n "$SG1" ]; then
  AWS ec2 authorize-security-group-ingress --group-id "$SG1" --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true
  AWS ec2 authorize-security-group-ingress --group-id "$SG1" --protocol tcp --port 3389 --cidr 0.0.0.0/0 2>/dev/null || true
  echo "  ✅ EC2: Open SSH+RDP"
fi

SG2=$(AWS ec2 create-security-group --group-name demo-all-open --description "All open" --query GroupId --output text 2>/dev/null) || SG2=""
if [ -n "$SG2" ]; then
  AWS ec2 authorize-security-group-ingress --group-id "$SG2" --ip-permissions '[{"IpProtocol":"-1","IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' 2>/dev/null || true
  echo "  ✅ EC2: Open all traffic"
fi

# Lambda
echo 'exports.handler=async()=>{}' > /tmp/lambda.js && zip -j /tmp/lambda.zip /tmp/lambda.js 2>/dev/null
try lambda create-function --function-name demo-old-runtime --runtime nodejs16.x \
  --role arn:aws:iam::000000000000:role/lambda-role --handler index.handler --zip-file fileb:///tmp/lambda.zip
try lambda create-function --function-name demo-no-encryption --runtime nodejs20.x \
  --role arn:aws:iam::000000000000:role/lambda-role --handler index.handler --zip-file fileb:///tmp/lambda.zip

# ECR
try ecr create-repository --repository-name demo-public-repo
AWS ecr set-repository-policy --repository-name demo-public-repo \
  --policy-text '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":["ecr:*"]}]}' 2>/dev/null || true

# ── IAM ──
try iam create-user --user-name demo-admin
AWS iam attach-user-policy --user-name demo-admin --policy-arn arn:aws:iam::aws:policy/AdministratorAccess 2>/dev/null || true
AWS iam create-access-key --user-name demo-admin 2>/dev/null || true
try iam create-user --user-name demo-unused
try iam create-user --user-name demo-stale-key

# ── DATABASE ──
try dynamodb create-table --table-name demo-public-table \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH --billing-mode PAY_PER_REQUEST
try dynamodb create-table --table-name demo-no-autoscaling \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1

# ── APP INTEGRATION ──
try sqs create-queue --queue-name demo-public-queue
try sqs create-queue --queue-name demo-no-dlq
try sns create-topic --name demo-public-topic
try sns create-topic --name demo-no-subscription

# ── MANAGEMENT ──
try s3 mb s3://demo-cloudtrail-logs
try cloudtrail create-trail --name demo-trail --s3-bucket-name demo-cloudtrail-logs --is-multi-region-trail
try logs create-log-group --log-group-name /demo/no-retention
try logs create-log-group --log-group-name /demo/encryption-missing
try ssm put-parameter --name /demo/db-password --type String --value "SuperSecret123!" --overwrite
try ssm put-parameter --name /demo/api-key --type String --value "sk-live-abc123" --overwrite
try ssm put-parameter --name /demo/private-key --type String --value "PRIVATE_KEY_CONTENT" --overwrite

# ── SECURITY ──
try cognito-idp create-user-pool --pool-name demo-no-mfa
try secretsmanager create-secret --name demo-db-password --secret-string '{"username":"admin","password":"secret"}'
try secretsmanager create-secret --name demo-api-key --secret-string 'sk-live-abcdef123456'
try acm request-certificate --domain-name demo.mcpshield.local --validation-method DNS

# ── ANALYTICS ──
try athena create-work-group --name demo-no-encryption \
  --configuration ResultConfiguration={OutputLocation=s3://demo-athena-results/}
try kinesis create-stream --stream-name demo-no-encryption --shard-count 1
try glue create-database --database-input '{"Name":"demo_public_db"}'
try opensearch create-domain --domain-name demo-public \
  --cluster-config InstanceType=t3.small.search,InstanceCount=1 \
  --ebs-options EBSEnabled=true,VolumeSize=10

# ── DEVELOPER TOOLS ──
try codecommit create-repository --repository-name demo-public-repo
try appconfig create-application --name demo-no-validation

# ── FRONT-END ──
try appsync create-graphql-api --name demo-public-api --authentication-type API_KEY

# ── NETWORKING ──
try route53 create-hosted-zone --name demo.mcpshield.local --caller-reference "$(date +%s)"

# ── EMAIL ──
try ses verify-email-identity --email-address demo@mcpshield.local

echo ""
echo "Provisioning complete. Run MCPShield scan to detect vulnerabilities."
