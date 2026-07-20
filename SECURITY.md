# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |

## Reporting a Vulnerability

MCPShield is a security tool that scans cloud environments. If you discover a vulnerability in MCPShield itself (not in a scanned environment), please report it privately.

**Do not open public issues.** Instead, email [akintunero101@gmail.com](mailto:akintunero101@gmail.com).

Please include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Any potential impact

We will acknowledge receipt within 48 hours and provide a timeline for remediation.

## Scope

This security policy covers:
- The MCPShield codebase (all packages and apps)
- Docker images
- Build and deployment configurations

It does not cover:
- Vulnerabilities in LocalStack (report to the LocalStack team)
- Vulnerabilities in the LLM providers used
- Misconfigurations in the AWS environment being scanned (that's the tool's job!)
