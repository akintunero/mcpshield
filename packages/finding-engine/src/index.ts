/**
 * @mcpshield/finding-engine — the curated findings catalog and a registry to
 * query it. This package is AWS-independent; scanners in the security-engine
 * consume it to instantiate concrete findings.
 */
export { CATALOG } from './catalog.js';
export { FindingRegistry, defaultRegistry } from './registry.js';
