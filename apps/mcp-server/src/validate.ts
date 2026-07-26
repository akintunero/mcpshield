const MAX_STRING_LENGTH = 256;
const MAX_ARRAY_LENGTH = 100;

let validCatalogIdsCache: Set<string> | null = null;

function getValidCatalogIds(): Set<string> {
  if (!validCatalogIdsCache) {
    try {
      const { defaultRegistry } = require('@mcpshield/security-engine');
      validCatalogIdsCache = new Set((defaultRegistry.all() || []).map((e: any) => e.id));
    } catch {
      validCatalogIdsCache = new Set();
    }
  }
  return validCatalogIdsCache!;
}

export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateString(value: unknown, field: string, maxLength = MAX_STRING_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(field, `${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(field, `${field} exceeds maximum length of ${maxLength}`);
  }
  if (/[<>"'&]/.test(value)) {
    throw new ValidationError(field, `${field} contains invalid characters`);
  }
  return value;
}

export function validateFindingId(value: unknown): string {
  const str = validateString(value, 'findingId');
  if (!/^[A-Z0-9-]+:[a-zA-Z0-9._-]+$/.test(str) && !/^[A-Z0-9-]+$/.test(str)) {
    throw new ValidationError('findingId', 'Invalid findingId format. Expected format: "CATALOG-ID:resource-id"');
  }
  return str;
}

export function validateCatalogId(value: unknown): string {
  const str = validateString(value, 'catalogId');
  const valid = getValidCatalogIds();
  if (valid.size > 0 && !valid.has(str)) {
    throw new ValidationError('catalogId', `Unknown catalogId "${str}". Valid IDs: ${[...valid].join(', ')}`);
  }
  return str;
}

export function validateResourceId(value: unknown): string {
  const str = validateString(value, 'resourceId');
  if (str.includes('..') || str.includes('/') || str.includes('\\')) {
    throw new ValidationError('resourceId', 'resourceId must not contain path traversal sequences');
  }
  return str;
}

export function validateFindingIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('findingIds', 'findingIds must be an array');
  }
  if (value.length === 0) {
    throw new ValidationError('findingIds', 'findingIds must not be empty');
  }
  if (value.length > MAX_ARRAY_LENGTH) {
    throw new ValidationError('findingIds', `findingIds exceeds maximum of ${MAX_ARRAY_LENGTH} items`);
  }
  return value.map((id) => validateFindingId(id));
}

export function validateApprovedBy(value: unknown): string {
  const str = validateString(value, 'approvedBy');
  if (str.length > 64) {
    throw new ValidationError('approvedBy', 'approvedBy exceeds maximum length of 64');
  }
  return str;
}
