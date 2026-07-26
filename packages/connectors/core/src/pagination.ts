import type { ListResourcesOptions, ListResourcesResult, ConnectorResource } from './connector.js';

export type ListPageFn = (options: ListResourcesOptions) => Promise<ListResourcesResult>;

/**
 * Utility to paginate through all results from a connector.
 * Handles nextToken-based pagination transparently.
 */
export function createPaginationHandler() {
  return {
    async *paginate(fn: ListPageFn, options: ListResourcesOptions): AsyncGenerator<ConnectorResource> {
      let token: string | undefined;
      do {
        const result = await fn({ ...options, nextToken: token });
        for (const r of result.resources) yield r;
        token = result.nextToken;
      } while (token);
    },

    async collect(fn: ListPageFn, options: ListResourcesOptions): Promise<ConnectorResource[]> {
      const all: ConnectorResource[] = [];
      for await (const r of this.paginate(fn, options)) all.push(r);
      return all;
    },
  };
}
