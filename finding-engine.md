# Finding Engine

The finding engine manages the catalog of all known security finding types and provides registry lookup capabilities.

## Catalog

Each catalog entry defines a class of misconfiguration independent of any live resource. Entries include:

- **ID** — Unique identifier (e.g. `MCPS-S3-001`)
- **Title** — Human-readable name
- **Severity** — critical, high, medium, low
- **Service** — AWS service (s3, iam, ec2, etc.)
- **Description** — Detailed explanation
- **Business Impact** — Why it matters to the business
- **Technical Impact** — Technical consequences
- **Attack Scenario** — How an attacker could exploit it
- **Best Practice** — AWS recommended approach
- **MITRE ATT&CK** — Tactic, technique ID, technique name
- **CIS Benchmark** — Benchmark, control ID, title
- **Base Risk Score** — Severity-weighted score (0-100)
- **Remediation** — Terraform HCL + AWS CLI command templates
- **References** — Links to AWS documentation

## Registry

The `FindingRegistry` class provides:

```typescript
registry.get(id: string): FindingCatalogEntry | undefined
registry.require(id: string): FindingCatalogEntry  // throws if missing
registry.findAllBySeverity(severity): FindingCatalogEntry[]
registry.findAllByService(service): FindingCatalogEntry[]
registry.sortByRiskScore(): FindingCatalogEntry[]
```

## Placeholder System

Remediation templates use `{{placeholders}}` that are rendered with resource-specific values:

| Placeholder | Source |
|---|---|
| `{{bucket}}` | Resource ID (S3) |
| `{{userName}}` | Resource ID (IAM) |
| `{{accessKeyId}}` | Evidence (IAM access keys) |
| `{{sgId}}` | Resource ID (EC2 security group) |
| `{{region}}` | Resource or config region |
| `{{endpoint}}` | LocalStack endpoint URL |
| `{{resourceId}}` | Sanitized resource ID |
| `{{resourceType}}` | Resource type (bucket, user, etc.) |
