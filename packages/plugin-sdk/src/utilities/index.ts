export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function elapsed(start: number): string {
  return `${Date.now() - start}ms`;
}

export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = String(item[key]);
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
  }
  return groups;
}
