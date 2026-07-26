import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { createLogger } from '@mcpshield/logger';

const logger = createLogger('mcp-core:assume-role');

export interface AccountConfig {
  id: string;
  name: string;
  roleArn: string;
  region: string;
  externalId?: string;
}

export interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
  accountId: string;
}

/**
 * Multi-account AssumeRole support.
 * Given a list of accounts, assumes the configured role in each and
 * returns temporary credentials scoped to that account.
 */
export class AssumeRoleProvider {
  private sts: STSClient;

  constructor() {
    this.sts = new STSClient({});
  }

  async assumeRole(account: AccountConfig): Promise<AssumedCredentials> {
    try {
      const command = new AssumeRoleCommand({
        RoleArn: account.roleArn,
        RoleSessionName: `mcpshield-scan-${account.id}`,
        ExternalId: account.externalId,
        DurationSeconds: 900, // 15 minutes
      });
      const response = await this.sts.send(command);
      const creds = response.Credentials!;
      return {
        accessKeyId: creds.AccessKeyId!,
        secretAccessKey: creds.SecretAccessKey!,
        sessionToken: creds.SessionToken!,
        expiration: creds.Expiration!,
        accountId: account.id,
      };
    } catch (e: any) {
      logger.error(`Failed to assume role ${account.roleArn}: ${e.message}`);
      throw e;
    }
  }

  async assumeAll(accounts: AccountConfig[]): Promise<AssumedCredentials[]> {
    return Promise.all(accounts.map((a) => this.assumeRole(a)));
  }
}
