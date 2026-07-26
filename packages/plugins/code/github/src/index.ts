import { createPlugin } from '@mcpshield/plugin-sdk';

export default createPlugin({
  apiVersion: 'v1',
  id: 'github',
  name: 'GitHub',
  version: '1.0.0',
  category: 'code',
  capabilities: ['discover', 'scan'],

  async discover(ctx) {
    const token = ctx.config.githubToken as string;
    if (!token) {
      ctx.logger.warn('No GitHub token configured — set config.githubToken');
      return [];
    }
    const res = await fetch('https://api.github.com/user/repos?per_page=100', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!res.ok) {
      ctx.logger.error(`GitHub API error: ${res.status}`);
      return [];
    }
    const repos: any[] = await res.json();
    return repos.map((r) => ({
      provider: 'github',
      service: 'github',
      type: 'repository',
      id: r.full_name,
      nativeRef: r.html_url,
      attributes: { private: r.private, language: r.language, defaultBranch: r.default_branch },
      tags: {},
    }));
  },

  async scan(ctx) {
    const discovered = await this.discover!(ctx);
    const findings: any[] = [];

    for (const repo of discovered as any[]) {
      const repoName = repo.id;
      ctx.logger.info(`Scanning ${repoName}...`);

      // Check if repository has a security policy
      try {
        const token = ctx.config.githubToken as string;
        const res = await fetch(`https://api.github.com/repos/${repoName}/security-advisories`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (res.status === 404) {
          findings.push({
            id: `github/${repoName}/no-security-policy`,
            title: 'Repository lacks security policy',
            severity: 'medium',
            resource: { type: 'repository', id: repoName },
            remediation: { summary: 'Add SECURITY.md to the repository root' },
          });
        }
      } catch {}

      // Check if branch protection is enabled on default branch
      try {
        const token = ctx.config.githubToken as string;
        const branchRes = await fetch(`https://api.github.com/repos/${repoName}/branches/main`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (branchRes.ok) {
          const branch: any = await branchRes.json();
          if (!branch.protected) {
            findings.push({
              id: `github/${repoName}/unprotected-branch`,
              title: 'Default branch is not protected',
              severity: 'high',
              resource: { type: 'repository', id: repoName },
              remediation: { summary: 'Enable branch protection rules on the default branch' },
            });
          }
        }
      } catch {}
    }

    return findings;
  },
});
