/**
 * @mcpshield/types — the single source of truth for MCPShield contracts.
 *
 * Every other package and app imports domain types and Zod schemas from here.
 * Nothing in this package has runtime dependencies beyond `zod`.
 */
export * from './severity.js';
export * from './aws.js';
export * from './finding.js';
export * from './scan.js';
export * from './score.js';
export * from './remediation.js';
export * from './approval.js';
export * from './report.js';
export * from './llm.js';
export * from './mcp.js';

/** The MCPShield product version, surfaced by the MCP `health` tool. */
export const MCPSHIELD_VERSION = '1.0.0';
