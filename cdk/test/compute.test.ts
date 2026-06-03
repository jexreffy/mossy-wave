import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ComputeStack } from '../lib/compute-stack';

function buildStack() {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'us-east-1' };

  // Minimal dependency stubs
  const vpcStack = new cdk.Stack(app, 'VpcStack', { env });
  const vpc = new ec2.Vpc(vpcStack, 'Vpc', {
    natGateways: 0,
    subnetConfiguration: [
      { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
    ],
  });
  const lambdaSg = new ec2.SecurityGroup(vpcStack, 'Sg', { vpc });

  const storageStack = new cdk.Stack(app, 'StorageStack', { env });
  const notesTable = new dynamodb.Table(storageStack, 'Table', {
    partitionKey: { name: 'noteId', type: dynamodb.AttributeType.STRING },
  });
  const imagesBucket = new s3.Bucket(storageStack, 'Bucket');

  const rdsStack = new cdk.Stack(app, 'RdsStack', { env });
  const dbInstance = new rds.DatabaseInstance(rdsStack, 'Db', {
    engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  });

  const stack = new ComputeStack(app, 'TestCompute', {
    env,
    vpc,
    lambdaSg,
    notesTable,
    imagesBucket,
    dbInstance,
    dbPassword: 'test-password',
  });
  return Template.fromStack(stack);
}

describe('ComputeStack', () => {
  it('deploys exactly 8 Lambda functions', () => {
    const template = buildStack();
    template.resourceCountIs('AWS::Lambda::Function', 8);
  });

  it('all Lambda functions use Node 22 runtime', () => {
    const template = buildStack();
    const fns = template.findResources('AWS::Lambda::Function');
    const appFns = Object.values(fns).filter(
      (f: any) => f.Properties.Runtime === 'nodejs22.x',
    );
    // 8 app functions + possibly CDK custom resource functions
    expect(appFns.length).toBeGreaterThanOrEqual(8);
  });

  it('X-Ray active tracing is enabled on all app Lambda functions', () => {
    const template = buildStack();
    // Every function with nodejs22.x runtime should have TracingConfig Active
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'nodejs22.x' },
    });
    Object.values(fns).forEach((fn: any) => {
      expect(fn.Properties.TracingConfig).toEqual({ Mode: 'Active' });
    });
  });

  it('all Lambda functions run inside the VPC', () => {
    const template = buildStack();
    const fns = template.findResources('AWS::Lambda::Function', {
      Properties: { Runtime: 'nodejs22.x' },
    });
    Object.values(fns).forEach((fn: any) => {
      expect(fn.Properties.VpcConfig).toBeDefined();
    });
  });

  it('RDS-backed tag functions have DB env vars set', () => {
    const template = buildStack();
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          DB_HOST: Match.anyValue(),
          DB_NAME: 'mossywave',
          DB_USER: 'mossywave',
        }),
      },
    });
  });
});
