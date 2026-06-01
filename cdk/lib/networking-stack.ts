import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkingStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly lambdaSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      // No NAT gateway — Lambda uses VPC endpoint to reach DynamoDB for free
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Free gateway endpoint — Lambda in private subnet reaches DynamoDB without NAT
    this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      description: 'Lambda functions - egress to DynamoDB VPC endpoint only',
      allowAllOutbound: false,
    });

    // DynamoDB endpoint is reachable on HTTPS
    this.lambdaSg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS to DynamoDB VPC endpoint',
    );

    // TODO: Add EC2 bastion (t2.micro, free tier) once account EC2 launch limit is lifted
    // bastionSg + ec2.Instance go here

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
  }
}
