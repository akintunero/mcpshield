# Security Engine

The security engine evaluates resource snapshots against 15 security rules and generates findings.

## How It Works

```
Resource Snapshots → Security Rules → Findings
```

The engine iterates over each resource snapshot and runs every rule against it. Rules that produce a violation generate a `Finding` with evidence.

## 15 Security Rules

### Critical

| ID | Rule |
|---|---|
| `MCPS-S3-001` | Public S3 bucket (no Block Public Access, public ACLs/policy) |
| `MCPS-IAM-001` | AdministratorAccess attached to IAM user |
| `MCPS-IAM-002` | Old access keys (> 90 days) |

### High

| ID | Rule |
|---|---|
| `MCPS-EC2-001` | SSH port 22 open to 0.0.0.0/0 |
| `MCPS-EC2-002` | RDP port 3389 open to 0.0.0.0/0 |
| `MCPS-S3-002` | S3 bucket missing default encryption |
| `MCPS-S3-003` | S3 bucket versioning disabled |
| `MCPS-CT-001` | CloudTrail disabled or not logging |

### Medium

| ID | Rule |
|---|---|
| `MCPS-IAM-003` | Weak password policy |
| `MCPS-IAM-004` | Unused IAM user (> 90 days) |
| `MCPS-IAM-005` | Unused access keys (> 90 days) |
| `MCPS-S3-004` | S3 bucket logging disabled |

### Low

| ID | Rule |
|---|---|
| `MCPS-TAG-001` | Missing resource tags (Owner, Environment, DataClassification) |
| `MCPS-NAM-001` | Poor naming convention |
| `MCPS-DESC-001` | Missing resource descriptions |

## Rule Format

Each rule is a pure function:

```typescript
function checkPublicS3Bucket(snapshot: ResourceSnapshot): RuleEvaluation | null
```

Returns `null` if the rule does not apply to the snapshot. Otherwise returns an evaluation with `isViolated`, `catalogId`, and `evidence`.

## Extending

Add new rules in `packages/security-engine/src/rules.ts`:

1. Create a check function following the `RuleEvaluation` interface
2. Export it and add it to the `RULES` array
3. Add a corresponding catalog entry in `packages/finding-engine/src/catalog.ts`
