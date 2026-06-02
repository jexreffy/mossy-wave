import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { StorageStack } from '../lib/storage-stack';

function buildStack() {
  const app = new cdk.App();
  const stack = new StorageStack(app, 'TestStorage', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('StorageStack', () => {
  it('DynamoDB table uses PAY_PER_REQUEST billing (no provisioned capacity cost)', () => {
    const template = buildStack();
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('DynamoDB table has a GSI for time-ordered listing', () => {
    const template = buildStack();
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'createdAt-index' }),
      ]),
    });
  });

  it('DynamoDB table has TTL enabled (auto-expire notes)', () => {
    const template = buildStack();
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    });
  });

  it('images bucket blocks all public ACLs', () => {
    const template = buildStack();
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 's3:GetObject', Effect: 'Allow' }),
        ]),
      }),
    });
    // BlockPublicAcls must be true even though public read policy is allowed
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: Match.objectLike({
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
      }),
    });
  });

  it('images bucket has a CORS rule allowing PUT from any origin', () => {
    const template = buildStack();
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: Match.arrayWith([
          Match.objectLike({ AllowedMethods: Match.arrayWith(['PUT']) }),
        ]),
      },
    });
  });

  it('images bucket has a 90-day lifecycle expiry rule', () => {
    const template = buildStack();
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ ExpirationInDays: 90, Status: 'Enabled' }),
        ]),
      },
    });
  });
});
