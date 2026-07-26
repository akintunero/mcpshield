import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:audit');

export type AuditExportFormat = 'json' | 'syslog' | 'splunk-hec';

export class AuditExporter {
  constructor(private outputDir: string) {}

  export(entries: any[], format: AuditExportFormat): string {
    mkdirSync(this.outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    switch (format) {
      case 'json': {
        const path = join(this.outputDir, `audit-${timestamp}.json`);
        writeFileSync(path, JSON.stringify(entries, null, 2));
        logger.info(`Exported ${entries.length} audit entries to ${path}`);
        return path;
      }
      case 'syslog': {
        const path = join(this.outputDir, `audit-${timestamp}.syslog`);
        const lines = entries.map((e) =>
          `<14>1 ${e.timestamp} mcpshield MCPShield - - [audit@49313 action="${e.action}" findingIds="${(e.findingIds || []).join(',')}"] ${e.summary}`
        );
        writeFileSync(path, lines.join('\n'));
        logger.info(`Exported ${entries.length} syslog entries to ${path}`);
        return path;
      }
      case 'splunk-hec': {
        const path = join(this.outputDir, `audit-${timestamp}.json`);
        const events = entries.map((e) => JSON.stringify({
          event: e,
          sourcetype: 'mcpshield:audit',
          time: new Date(e.timestamp).getTime() / 1000,
        }));
        writeFileSync(path, events.join('\n'));
        logger.info(`Exported ${entries.length} Splunk HEC events to ${path}`);
        return path;
      }
    }
  }
}
