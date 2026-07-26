import type { Connector, ConnectorConfig, ConnectorHealth, ConnectorResource, ListResourcesOptions, ListResourcesResult } from '@mcpshield/connectors-core';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { IAMClient, ListUsersCommand } from '@aws-sdk/client-iam';
import { EC2Client, DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import {  } from '@mcpshield/connectors-core';

export class AwsConnector implements Connector {
  readonly id = 'aws';
  readonly displayName = 'AWS SDK';
  private config!: ConnectorConfig;
  private clients: Record<string, any> = {};

  async connect(config: ConnectorConfig): Promise<void> {
    this.config = config;
    const region = config.region || 'us-east-1';
    const creds = config.auth?.credentials || {};
    const clientConfig: any = { region };
    if (creds.accessKeyId && creds.secretAccessKey) {
      clientConfig.credentials = { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey };
    }
    this.clients.s3 = new S3Client(clientConfig);
    this.clients.iam = new IAMClient(clientConfig);
    this.clients.ec2 = new EC2Client(clientConfig);
  }

  async disconnect(): Promise<void> {
    for (const c of Object.values(this.clients)) c?.destroy?.();
    this.clients = {};
  }

  async health(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.clients.s3.send(new ListBucketsCommand({}));
      return { reachable: true, identity: 's3:active', latency: Date.now() - start, version: '1.0.0' };
    } catch (e: any) {
      return { reachable: false, latency: Date.now() - start, error: e.message };
    }
  }

  async execute<T>(operation: string, params?: Record<string, unknown>): Promise<T> {
    const [service, ...cmdParts] = operation.split('.');
    const client = this.clients[service!];
    if (!client) throw new Error(`Unknown AWS service: ${service}`);
    const { default: Cmd } = await import(`@aws-sdk/client-${service}/dist-es/commands/${cmdParts!.join('')}.js`);
    const command = new Cmd(params || {});
    return client.send(command) as T;
  }

  async listResources(type: string, options?: ListResourcesOptions): Promise<ListResourcesResult> {
    const maxResults = options?.maxResults || 100;

    switch (type) {
      case 's3:bucket': {
        const res = await this.clients.s3.send(new ListBucketsCommand({}));
        return {
          resources: (res.Buckets || []).map((b: any) => ({
            id: b.Name!, name: b.Name!, type: 'bucket', service: 's3',
            properties: { creationDate: b.CreationDate?.toISOString() }, tags: {},
          })),
        };
      }
      case 'iam:user': {
        const allUsers: any[] = [];
        let marker: string | undefined;
        do {
          const res = await this.clients.iam.send(new ListUsersCommand({ Marker: marker, MaxItems: maxResults }));
          allUsers.push(...(res.Users || []));
          marker = res.Marker;
        } while (marker);
        return {
          resources: allUsers.map((u: any) => ({
            id: u.UserName!, name: u.UserName!, type: 'user', service: 'iam',
            properties: { userId: u.UserId, createDate: u.CreateDate?.toISOString() }, tags: {},
          })),
        };
      }
      case 'ec2:security-group': {
        const allSgs: any[] = [];
        let nextToken: string | undefined;
        do {
          const res = await this.clients.ec2.send(new DescribeSecurityGroupsCommand({ NextToken: nextToken, MaxResults: maxResults }));
          allSgs.push(...(res.SecurityGroups || []));
          nextToken = res.NextToken;
        } while (nextToken);
        return {
          resources: allSgs.map((sg: any) => ({
            id: sg.GroupId!, name: sg.GroupName!, type: 'security-group', service: 'ec2',
            properties: { description: sg.Description, vpcId: sg.VpcId }, tags: {},
          })),
        };
      }
      default:
        return { resources: [] };
    }
  }

  async getResource(type: string, id: string): Promise<ConnectorResource | null> {
    const result = await this.listResources(type);
    return result.resources.find((r) => r.id === id) || null;
  }

  async tagResource(type: string, id: string, tags: Record<string, string>): Promise<void> {
    // AWS tagging - placeholder for now
  }
}

export { ConnectorResource, ConnectorHealth, ConnectorConfig } from '@mcpshield/connectors-core';
