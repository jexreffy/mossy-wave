import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  lambdaSg: ec2.SecurityGroup;
  notesTable: dynamodb.Table;
}

export class ComputeStack extends cdk.Stack {
  readonly listFn: lambda.Function;
  readonly createFn: lambda.Function;
  readonly deleteFn: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { vpc, lambdaSg, notesTable } = props;

    const commonEnv = {
      TABLE_NAME: notesTable.tableName,
      REGION: this.region,
    };

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    // Least-privilege: only the actions each handler actually needs
    notesTable.grantReadData(role);
    notesTable.grantWriteData(role);

    const commonProps: Partial<lambda.FunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc,
      securityGroups: [lambdaSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      role,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    };

    this.listFn = new lambda.Function(this, 'ListNotes', {
      ...commonProps,
      handler: 'list.handler',
      code: lambda.Code.fromAsset('../api/dist'),
      logRetention: logs.RetentionDays.ONE_WEEK,
    } as lambda.FunctionProps);

    this.createFn = new lambda.Function(this, 'CreateNote', {
      ...commonProps,
      handler: 'create.handler',
      code: lambda.Code.fromAsset('../api/dist'),
      logRetention: logs.RetentionDays.ONE_WEEK,
    } as lambda.FunctionProps);

    this.deleteFn = new lambda.Function(this, 'DeleteNote', {
      ...commonProps,
      handler: 'delete.handler',
      code: lambda.Code.fromAsset('../api/dist'),
      logRetention: logs.RetentionDays.ONE_WEEK,
    } as lambda.FunctionProps);
  }
}
