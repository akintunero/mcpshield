import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:webhook');

export interface WebhookConfig {
  url: string;
  secret?: string;
  events: string[];
}

export class WebhookNotifier {
  private webhooks: WebhookConfig[] = [];

  register(config: WebhookConfig): void {
    this.webhooks.push(config);
    logger.info(`Registered webhook for events: ${config.events.join(', ')}`);
  }

  async notify(event: string, payload: Record<string, unknown>): Promise<void> {
    for (const webhook of this.webhooks) {
      if (!webhook.events.includes(event) && !webhook.events.includes('*')) continue;
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (webhook.secret) {
          headers['X-Webhook-Signature'] = webhook.secret;
        }
        await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ event, timestamp: new Date().toISOString(), payload }),
        });
        logger.debug(`Webhook ${webhook.url} notified for ${event}`);
      } catch (e: any) {
        logger.error(`Webhook ${webhook.url} failed: ${e.message}`);
      }
    }
  }
}
