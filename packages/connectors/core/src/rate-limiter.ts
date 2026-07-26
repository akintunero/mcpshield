export interface RateLimiterOptions {
  requestsPerSecond: number;
  burstSize?: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const interval = 1000 / options.requestsPerSecond;
  let lastCall = 0;

  return {
    async acquire(): Promise<void> {
      const now = Date.now();
      const elapsed = now - lastCall;
      if (elapsed < interval) {
        await new Promise((r) => setTimeout(r, interval - elapsed));
      }
      lastCall = Date.now();
    },
  };
}
