import type { FindingCatalogEntry, Severity, AwsService } from '@mcpshield/types';
import { FindingCatalogEntrySchema, compareSeverity } from '@mcpshield/types';
import { CATALOG } from './catalog.js';

/**
 * A validated, indexed view over the findings catalog. Construction validates
 * every entry against the schema and rejects duplicate ids (fail fast).
 */
export class FindingRegistry {
  private readonly byId: Map<string, FindingCatalogEntry>;

  constructor(entries: readonly FindingCatalogEntry[] = CATALOG) {
    const validated = entries.map((entry) => FindingCatalogEntrySchema.parse(entry));
    this.byId = new Map(validated.map((entry) => [entry.id, entry]));
    if (this.byId.size !== validated.length) {
      throw new Error('Findings catalog contains duplicate ids.');
    }
  }

  /** Number of catalog entries. */
  get size(): number {
    return this.byId.size;
  }

  /** All entries in catalog order. */
  all(): FindingCatalogEntry[] {
    return [...this.byId.values()];
  }

  /** Whether a catalog id exists. */
  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Look up an entry by catalog id. */
  get(id: string): FindingCatalogEntry | undefined {
    return this.byId.get(id);
  }

  /** Look up an entry by catalog id, throwing if absent. */
  require(id: string): FindingCatalogEntry {
    const entry = this.byId.get(id);
    if (!entry) {
      throw new Error(`Unknown finding catalog id: ${id}`);
    }
    return entry;
  }

  /** Entries with the given severity. */
  bySeverity(severity: Severity): FindingCatalogEntry[] {
    return this.all().filter((entry) => entry.severity === severity);
  }

  /** Entries for the given AWS service. */
  byService(service: AwsService): FindingCatalogEntry[] {
    return this.all().filter((entry) => entry.service === service);
  }

  /** Entries sorted by severity (critical first) then descending base risk. */
  sorted(): FindingCatalogEntry[] {
    return this.all().sort(
      (a, b) => compareSeverity(a.severity, b.severity) || b.baseRiskScore - a.baseRiskScore,
    );
  }
}

/** A ready-to-use registry backed by the built-in catalog. */
export const defaultRegistry = new FindingRegistry();
