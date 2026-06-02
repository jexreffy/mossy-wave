import * as cdk from 'aws-cdk-lib';
import { NetworkingStack } from '../lib/networking-stack';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { RdsStack } from '../lib/rds-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const networking = new NetworkingStack(app, 'MossyWaveNetworking', { env });
const storage = new StorageStack(app, 'MossyWaveStorage', { env });
const auth = new AuthStack(app, 'MossyWaveAuth', { env });
const rds = new RdsStack(app, 'MossyWaveRds', {
  env,
  vpc: networking.vpc,
  lambdaSg: networking.lambdaSg,
});
const compute = new ComputeStack(app, 'MossyWaveCompute', {
  env,
  vpc: networking.vpc,
  lambdaSg: networking.lambdaSg,
  notesTable: storage.notesTable,
  imagesBucket: storage.imagesBucket,
  dbInstance: rds.dbInstance,
  dbPassword: rds.dbPassword,
});
const api = new ApiStack(app, 'MossyWaveApi', {
  env,
  listFn: compute.listFn,
  createFn: compute.createFn,
  deleteFn: compute.deleteFn,
  getUploadUrlFn: compute.getUploadUrlFn,
  addTagFn: compute.addTagFn,
  removeTagFn: compute.removeTagFn,
  getTagsFn: compute.getTagsFn,
  getNoteTagsFn: compute.getNoteTagsFn,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
});
new ObservabilityStack(app, 'MossyWaveObservability', {
  env,
  listFn: compute.listFn,
  createFn: compute.createFn,
  deleteFn: compute.deleteFn,
  getUploadUrlFn: compute.getUploadUrlFn,
  httpApi: api.httpApi,
  alertEmail: process.env.ALERT_EMAIL ?? 'you@example.com',
});

new CdnStack(app, 'MossyWaveCdn', {
  // CloudFront requires us-east-1 for ACM certs
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  httpApi: api.httpApi,
});
