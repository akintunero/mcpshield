import type { Finding, Report, SecurityScore, TopRisk } from '@mcpshield/types';
import { shortId, nowIso } from '@mcpshield/shared';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('report-generator:generator');

function getSeverityBadge(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴 CRITICAL';
    case 'high':
      return '🟠 HIGH';
    case 'medium':
      return '🟡 MEDIUM';
    case 'low':
      return '🟢 LOW';
    default:
      return severity.toUpperCase();
  }
}

/**
 * Generate a structured executive security report from the findings and security score.
 */
export function generateReport(params: {
  scanId: string;
  endpoint: string;
  region: string;
  resourcesScanned: number;
  score: SecurityScore;
  allFindings: Finding[]; // includes both open and resolved/remediating
}): Report {
  const { scanId, endpoint, region, resourcesScanned, score, allFindings } = params;
  const reportId = shortId('rep');
  logger.info(`Generating security report ${reportId} for scan ${scanId}`);

  const openFindings = allFindings.filter((f) => f.status === 'open');
  const resolvedFindings = allFindings.filter((f) => f.status === 'resolved');

  // 1. Sort open findings by risk score to identify top risks
  const topRisks: TopRisk[] = [...openFindings]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5)
    .map((f) => ({
      findingId: f.findingId,
      catalogId: f.catalogId,
      title: f.title,
      severity: f.severity,
      riskScore: f.riskScore,
    }));

  // 2. Generate executive summary text
  let executiveSummary = '';
  if (score.score >= 90) {
    executiveSummary = `MCPShield completed a comprehensive security scan of AWS resources running on LocalStack. The environment shows a robust security posture with a score of ${score.score}/100 (Grade ${score.grade}). Only ${openFindings.length} minor, low-risk findings remain outstanding. Regular scanning is recommended to maintain this standard.`;
  } else if (score.score >= 70) {
    executiveSummary = `MCPShield completed a security scan of AWS resources running on LocalStack. The environment has a moderate security posture with a score of ${score.score}/100 (Grade ${score.grade}). A total of ${openFindings.length} findings were detected, some of which present medium or high security risks. Remediation of open network exposure and configuration gaps is recommended.`;
  } else {
    executiveSummary = `WARNING: MCPShield completed a security scan of AWS resources running on LocalStack and detected significant security vulnerabilities. The environment's security posture is POOR, with a score of ${score.score}/100 (Grade ${score.grade}). There are ${openFindings.length} open vulnerabilities, including multiple critical S3 data exposures and IAM administrative misconfigurations. Immediate remediation is required.`;
  }

  // 3. Generate high-level recommendations
  const recommendations: string[] = [];
  const openCritical = openFindings.filter((f) => f.severity === 'critical');
  const openHigh = openFindings.filter((f) => f.severity === 'high');

  if (openCritical.length > 0) {
    recommendations.push(
      `Immediately remediate all ${openCritical.length} CRITICAL vulnerabilities, focusing on public S3 buckets and direct IAM AdministratorAccess policy attachments.`,
    );
  }
  if (openHigh.length > 0) {
    recommendations.push(
      `Configure security groups to revoke public ingress access (0.0.0.0/0) for port 22 (SSH) and port 3389 (RDP) to prevent brute-force attacks.`,
    );
  }
  if (openFindings.some((f) => f.catalogId === 'MCPS-S3-002' || f.catalogId === 'MCPS-S3-003')) {
    recommendations.push(
      'Enforce default S3 bucket encryption and versioning on all active data stores to protect data at rest and ensure recovery capabilities.',
    );
  }
  if (openFindings.some((f) => f.catalogId === 'MCPS-CT-001')) {
    recommendations.push(
      'Enable account-wide multi-region CloudTrail logging to maintain proper forensics, monitoring, and audit compliance trails.',
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Maintain regular automated security scans and continue enforcing tagging/governance naming policies.',
    );
  }

  // 4. Compile Markdown representation
  const dateStr = new Date().toLocaleString();
  const markdown = `# MCPShield Security Posture Assessment

**Report ID:** \`${reportId}\`  
**Generated At:** ${dateStr}  
**Scan ID:** \`${scanId}\`  
**Target Environment:** \`${endpoint}\` (\`${region}\`)  
**Total Resources Scanned:** ${resourcesScanned}

---

## 📊 Posture Summary

> [!IMPORTANT]
> **Security Score: ${score.score}/100**  
> **Overall Grade: ${score.grade}**  
> Outstanding Findings: ${openFindings.length} | Resolved Findings: ${resolvedFindings.length}

### Severity Breakdown
*   **Critical:** ${score.breakdown.critical}
*   **High:** ${score.breakdown.high}
*   **Medium:** ${score.breakdown.medium}
*   **Low:** ${score.breakdown.low}

---

## 📝 Executive Summary
${executiveSummary}

---

## 🚨 Top Security Risks
${topRisks.length === 0 ? '*No major security risks outstanding.*' : ''}
${topRisks.map((r, i) => `${i + 1}. **[${r.severity.toUpperCase()}]** ${r.title} (\`${r.findingId}\`) - Risk Score: ${r.riskScore}`).join('\n')}

---

## 🛠️ Outstanding Security Findings

${openFindings.length === 0 ? '*No outstanding vulnerabilities found in this environment!*' : ''}
${
  openFindings.length > 0
    ? `
| Finding ID | Title | Severity | Service | Resource | Risk Score |
| :--- | :--- | :--- | :--- | :--- | :--- |
${openFindings.map((f) => `| \`${f.findingId}\` | ${f.title} | ${getSeverityBadge(f.severity)} | ${f.service.toUpperCase()} | \`${f.resource.type}:${f.resource.id}\` | ${f.riskScore} |`).join('\n')}
`
    : ''
}

---

## ✅ Completed Remediations
${resolvedFindings.length === 0 ? '*No remediations have been executed yet in this session.*' : ''}
${resolvedFindings.map((f) => `*   **[Fixed]** ${f.title} on \`${f.resource.type}:${f.resource.id}\` (Resolved at ${new Date(f.detectedAt).toLocaleTimeString()})`).join('\n')}

---

## 💡 Recommendations & Action Items
${recommendations.map((r) => `*   ${r}`).join('\n')}

***

*Report generated automatically by MCPShield Agent. Model Context Protocol (MCP) Cloud Security Analyst.*
`;

  return {
    reportId,
    generatedAt: nowIso(),
    scanId,
    endpoint,
    region,
    resourcesScanned,
    score,
    breakdown: score.breakdown,
    executiveSummary,
    topRisks,
    completedRemediations: resolvedFindings.map((f) => f.findingId),
    outstandingFindings: openFindings.map((f) => f.findingId),
    recommendations,
    markdown,
  };
}
