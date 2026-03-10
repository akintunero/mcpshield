import { describe, it, expect } from 'vitest';
import { FindingCatalogEntrySchema } from '@mcpshield/types';
import { CATALOG } from './catalog.js';
import { FindingRegistry, defaultRegistry } from './registry.js';

describe('findings catalog', () => {
  it('contains 21 entries', () => {
    expect(CATALOG).toHaveLength(21);
  });

  it('has unique catalog ids', () => {
    const ids = CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry validates against the schema', () => {
    for (const entry of CATALOG) {
      expect(() => FindingCatalogEntrySchema.parse(entry)).not.toThrow();
    }
  });

  it('covers all four severities with the expected distribution', () => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const entry of CATALOG) counts[entry.severity] += 1;
    expect(counts).toEqual({ critical: 3, high: 6, medium: 9, low: 3 });
  });

  it('provides MITRE and CIS mappings and both remediation kinds for every entry', () => {
    for (const entry of CATALOG) {
      expect(entry.mitre.length).toBeGreaterThan(0);
      expect(entry.cis.length).toBeGreaterThan(0);
      expect(entry.remediation.terraform.length).toBeGreaterThan(0);
      expect(entry.remediation.awsCli.length).toBeGreaterThan(0);
    }
  });
});

describe('FindingRegistry', () => {
  it('indexes the catalog', () => {
    expect(defaultRegistry.size).toBe(21);
    expect(defaultRegistry.has('MCPS-S3-001')).toBe(true);
    expect(defaultRegistry.require('MCPS-S3-001').title).toBe('Public S3 Bucket');
  });

  it('filters by severity and service', () => {
    expect(defaultRegistry.bySeverity('critical')).toHaveLength(3);
    expect(defaultRegistry.byService('s3').length).toBeGreaterThan(0);
  });

  it('sorts critical first', () => {
    const sorted = defaultRegistry.sorted();
    expect(sorted[0]?.severity).toBe('critical');
    expect(sorted[sorted.length - 1]?.severity).toBe('low');
  });

  it('throws on unknown id and duplicate catalog', () => {
    expect(() => defaultRegistry.require('nope')).toThrow();
    expect(() => new FindingRegistry([...CATALOG, CATALOG[0]!])).toThrow(/duplicate/i);
  });
});
