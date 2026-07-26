# LocalStack Setup

MCPShield scans and remediates a mock AWS environment running in [LocalStack](https://localstack.cloud/).

## Installation

```bash
# macOS / Linux
pip install localstack

# Verify
localstack --version
```

## Starting LocalStack

```bash
localstack start -d
```

Verify it is running:

```bash
curl http://localhost:4566/_localstack/health
```

Expected response includes `{"services": {...}, "status": "running"}`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` | LocalStack API endpoint |
| `AWS_ACCESS_KEY_ID` | `test` | Dummy credential (LocalStack ignores it) |
| `AWS_SECRET_ACCESS_KEY` | `test` | Dummy credential (LocalStack ignores it) |
| `AWS_DEFAULT_REGION` | `us-east-1` | Default AWS region |

For Docker Compose, use `http://host.docker.internal:4566` as the endpoint so containers can reach LocalStack on the host.

## Provisioning Resources

Run the bootstrap script to create intentionally vulnerable resources:

```bash
# After LocalStack is running
npx tsx scripts/provision.ts
```

This provisions 15+ resources across S3, IAM, EC2, CloudTrail, Lambda, SQS, SNS, Secrets Manager, SSM, DynamoDB, and CloudWatch, with intentional misconfigurations for the security scanner to detect.

## Health Check

The MCP Server's `health` tool verifies LocalStack connectivity:

```json
{
  "status": "healthy",
  "localstack": { "connected": true, "endpoint": "http://localhost:4566" },
  "version": "1.0.0"
}
```
