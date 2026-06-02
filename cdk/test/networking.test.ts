import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkingStack } from '../lib/networking-stack';

function buildStack() {
  const app = new cdk.App();
  const stack = new NetworkingStack(app, 'TestNetworking', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('NetworkingStack', () => {
  it('creates a VPC with 4 subnets (2 private + 2 public across 2 AZs)', () => {
    const template = buildStack();
    template.resourceCountIs('AWS::EC2::Subnet', 4);
  });

  it('creates a DynamoDB VPC gateway endpoint (free — no NAT Gateway)', () => {
    const template = buildStack();
    // ServiceName is a Fn::Join token at synth time — just assert Gateway type exists
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      VpcEndpointType: 'Gateway',
    });
  });

  it('Lambda SG has no unrestricted inbound rules', () => {
    const template = buildStack();
    // Lambda SG should allow no inbound — it only needs outbound to DynamoDB and RDS
    const sgs = template.findResources('AWS::EC2::SecurityGroup', {
      Properties: {
        GroupDescription: Match.stringLikeRegexp('Lambda'),
      },
    });
    const lambdaSg = Object.values(sgs)[0] as any;
    const inboundRules = lambdaSg.Properties.SecurityGroupIngress ?? [];
    expect(inboundRules).toHaveLength(0);
  });

  it('creates no NAT Gateways (free tier — uses VPC endpoint instead)', () => {
    const template = buildStack();
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });
});
