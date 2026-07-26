# Sample Data

This directory contains sample output data from MCPShield scans for reference and testing purposes. These files represent realistic scan results that can be used to:

- Preview the structure of MCPShield output
- Test the dashboard without a live LocalStack environment
- Demonstrate findings in documentation
- Use as fixture data in tests

## Files

- `scan-result.json` — Full scan result with findings
- `findings.json` — All findings from a typical workshop session
- `security-score.json` — Security score calculation example
- `report.json` — Executive report example
- `report.md` — Rendered markdown report example

## Regenerating

To regenerate sample data, run a scan against your LocalStack instance:

```bash
curl http://localhost:7801/mcp -d '{"method":"tools/call","params":{"name":"scan_environment","arguments":{}}}' | jq . > sample-data/scan-result.json
```
