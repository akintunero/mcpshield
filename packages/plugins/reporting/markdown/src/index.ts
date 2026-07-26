import { createPlugin } from '@mcpshield/plugin-sdk';

export default createPlugin({
  apiVersion: 'v1',
  id: 'markdown-reporter',
  name: 'Markdown Reporter',
  version: '1.0.0',
  category: 'reporting',
  capabilities: ['report'],

  async report(_ctx, findings: any[], score: any) {
    const severityColors: Record<string, string> = {
      critical: '🔴', high: '🟠', medium: '🟡', low: '🟢',
    };

    let md = `# MCPShield Security Report\n\n`;
    md += `**Generated:** ${new Date().toISOString()}\n`;
    md += `**Score:** ${score?.score || 'N/A'}/100 (${score?.grade || 'N/A'})\n\n`;

    if (score?.categoryBreakdown) {
      md += `## Category Breakdown\n\n`;
      md += `| Category | Score |\n|---------|------|\n`;
      for (const [cat, val] of Object.entries(score.categoryBreakdown)) {
        md += `| ${cat} | ${val}/100 |\n`;
      }
      md += '\n';
    }

    md += `## Findings\n\n`;
    if (!findings || findings.length === 0) {
      md += `_No findings detected._\n`;
    } else {
      md += `| Severity | ID | Resource | Risk |\n|---------|-----|----------|------|\n`;
      for (const f of findings) {
        const color = severityColors[f.severity] || '⚪';
        md += `| ${color} ${f.severity} | ${f.id} | ${f.resource?.type}:${f.resource?.id} | ${f.riskScore || 'N/A'} |\n`;
      }
    }

    return md;
  },
});
