import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking-stack';
import { StorageStack } from '../lib/storage-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const networking = new NetworkingStack(app, 'MossyWaveNetworking', { env });
const storage = new StorageStack(app, 'MossyWaveStorage', { env });
const compute = new ComputeStack(app, 'MossyWaveCompute', {
  env,
  vpc: networking.vpc,
  lambdaSg: networking.lambdaSg,
  notesTable: storage.notesTable,
});
const api = new ApiStack(app, 'MossyWaveApi', {
  env,
  listFn: compute.listFn,
  createFn: compute.createFn,
  deleteFn: compute.deleteFn,
});
new CdnStack(app, 'MossyWaveCdn', {
  // us-east-1 required for CloudFront ACM certs
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  frontendBucket: storage.frontendBucket,
  httpApi: api.httpApi,
});
