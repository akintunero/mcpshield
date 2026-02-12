import { S3Client } from '@aws-sdk/client-s3';
import { IAMClient } from '@aws-sdk/client-iam';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { SQSClient } from '@aws-sdk/client-sqs';
import { SNSClient } from '@aws-sdk/client-sns';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CloudTrailClient } from '@aws-sdk/client-cloudtrail';
import { EC2Client } from '@aws-sdk/client-ec2';
import { getConfig } from '@mcpshield/config';

export function getClientConfig() {
  const config = getConfig();
  const clientConfig: any = {
    region: config.aws.region,
  };

  const endpoint = config.aws.endpoint;
  const isLocal =
    endpoint &&
    (endpoint.includes('localhost') ||
      endpoint.includes('127.0.0.1') ||
      endpoint.includes('localstack') ||
      endpoint.includes('host.docker.internal'));

  if (isLocal) {
    clientConfig.endpoint = endpoint;
    clientConfig.credentials = {
      accessKeyId: config.aws.accessKeyId || 'test',
      secretAccessKey: config.aws.secretAccessKey || 'test',
    };
  } else {
    if (config.aws.accessKeyId && config.aws.accessKeyId !== 'test') {
      clientConfig.credentials = {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      };
    }
  }
  return clientConfig;
}

export const s3Client = new S3Client({
  ...getClientConfig(),
  forcePathStyle: !!(getConfig().aws.endpoint && (
    getConfig().aws.endpoint.includes('localhost') ||
    getConfig().aws.endpoint.includes('127.0.0.1') ||
    getConfig().aws.endpoint.includes('localstack') ||
    getConfig().aws.endpoint.includes('host.docker.internal')
  )),
});
export const iamClient = new IAMClient(getClientConfig());
export const lambdaClient = new LambdaClient(getClientConfig());
export const sqsClient = new SQSClient(getClientConfig());
export const snsClient = new SNSClient(getClientConfig());
export const secretsManagerClient = new SecretsManagerClient(getClientConfig());
export const ssmClient = new SSMClient(getClientConfig());
export const dynamoDBClient = new DynamoDBClient(getClientConfig());
export const cloudWatchClient = new CloudWatchClient(getClientConfig());
export const cloudTrailClient = new CloudTrailClient(getClientConfig());
export const ec2Client = new EC2Client(getClientConfig());
