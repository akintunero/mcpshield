import { getConfig } from '@mcpshield/config';
import { createLogger } from '@mcpshield/logger';
import { startSlackBot } from './slack.js';
import { loadDemoData } from './demo.js';

const logger = createLogger('agent:main');

async function main() {
  const isDemo = process.argv.includes('--demo');
  const isWorkshop = process.argv.includes('--workshop');

  logger.info(
    `Starting MCPShield AI Security Analyst Agent daemon... (demo=${isDemo}, workshop=${isWorkshop})`,
  );

  getConfig();

  if (isDemo) {
    logger.info('Demo mode enabled — loading sample data');
    const demoData = loadDemoData();
    if (demoData.findings.length > 0) {
      logger.info(
        `Demo data loaded: ${demoData.findings.length} findings, score ${demoData.securityScore.score}/100`,
      );
    }
  }

  await startSlackBot();
}

main().catch((err) => {
  logger.fatal(`Fatal error starting Slack Agent: ${err.message}`, err);
  process.exit(1);
});
