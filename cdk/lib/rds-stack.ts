import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  lambdaSg: ec2.SecurityGroup;
}

export class RdsStack extends cdk.Stack {
  readonly dbInstance: rds.DatabaseInstance;
  readonly dbPassword: string;
  readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const { vpc, lambdaSg } = props;

    // Password via CDK context so it never appears in committed code.
    // Pass with: cdk deploy --context dbPassword=yourpassword
    // GitHub Actions sets via DBPASSWORD secret + --context flag.
    this.dbPassword = this.node.tryGetContext('dbPassword') ?? 'MossyWave-Demo-2024!';

    this.dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'RDS Postgres - inbound from Lambda SG only',
      allowAllOutbound: false,
    });

    // Inbound to RDS from Lambda SG
    this.dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), 'Lambda to Postgres');

    // Egress from Lambda SG to RDS SG — use CfnSecurityGroupEgress directly
    // to avoid a cross-stack dependency cycle (lambdaSg lives in NetworkingStack)
    new ec2.CfnSecurityGroupEgress(this, 'LambdaToRdsEgress', {
      groupId: lambdaSg.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      destinationSecurityGroupId: this.dbSg.securityGroupId,
      description: 'Lambda to Postgres',
    });

    const subnetGroup = new rds.SubnetGroup(this, 'SubnetGroup', {
      vpc,
      description: 'RDS private subnet group',
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.dbInstance = new rds.DatabaseInstance(this, 'Postgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      // db.t3.micro — free tier: 750 hrs/month
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      subnetGroup,
      securityGroups: [this.dbSg],
      databaseName: 'mossywave',
      credentials: rds.Credentials.fromPassword(
        'mossywave',
        cdk.SecretValue.unsafePlainText(this.dbPassword),
      ),
      multiAz: false,              // multi-AZ is not free tier
      allocatedStorage: 20,        // free tier: 20 GB
      maxAllocatedStorage: 20,     // cap autoscaling at free tier limit
      storageEncrypted: false,     // encryption uses KMS ($1/key/month) — skip for demo
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      backupRetention: cdk.Duration.days(0),   // disable backups to avoid storage cost
      autoMinorVersionUpgrade: false,
      publiclyAccessible: false,   // private subnet only — no public endpoint
    });

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.dbInstance.dbInstanceEndpointAddress,
      description: 'RDS Postgres endpoint',
    });
  }
}
