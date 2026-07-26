import { createPlugin } from '@mcpshield/plugin-sdk';

export default createPlugin({
  apiVersion: 'v1',
  id: 'docker',
  name: 'Docker',
  version: '1.0.0',
  category: 'containers',
  capabilities: ['discover', 'scan'],

  async discover(ctx) {
    const images: any[] = [];
    try {
      const res = await fetch('http://localhost:2375/images/json?all=true');
      if (res.ok) {
        const list: any[] = await res.json();
        for (const img of list) {
          images.push({
            provider: 'docker',
            service: 'docker',
            type: 'image',
            id: img.Id?.slice(7, 19) || img.Id || 'unknown',
            nativeRef: img.RepoTags?.[0] || 'none',
            attributes: { created: img.Created, size: img.Size, repoDigests: img.RepoDigests },
            tags: {},
          });
        }
      }
    } catch (e: any) {
      ctx.logger.warn(`Docker daemon not reachable: ${e.message}`);
    }
    return images;
  },

  async scan(ctx) {
    const images: any[] = await this.discover!(ctx);
    const findings: any[] = [];

    for (const img of images) {
      // Check for dangling images
      if (img.nativeRef === '<none>:<none>') {
        findings.push({
          id: `docker/${img.id}/dangling`,
          title: 'Dangling Docker image',
          severity: 'low',
          resource: { type: 'image', id: img.id },
          remediation: { summary: 'Remove dangling images with `docker image prune`' },
        });
      }

      // Check for large images
      if ((img.attributes?.size || 0) > 1_000_000_000) {
        findings.push({
          id: `docker/${img.id}/oversized`,
          title: 'Image exceeds 1GB',
          severity: 'medium',
          resource: { type: 'image', id: img.id },
          remediation: { summary: 'Optimize Dockerfile to reduce image size' },
        });
      }
    }

    return findings;
  },
});
