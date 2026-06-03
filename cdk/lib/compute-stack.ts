import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  lambdaSg: ec2.SecurityGroup;
  notesTable: dynamodb.Table;
  imagesBucket: s3.Bucket;
  dbInstance: rds.DatabaseInstance;
  dbPassword: string;
}

export class ComputeStack extends cdk.Stack {
  readonly listFn: lambda.Function;
  readonly createFn: lambda.Function;
  readonly deleteFn: lambda.Function;
  readonly getUploadUrlFn: lambda.Function;
  readonly addTagFn: lambda.Function;
  readonly removeTagFn: lambda.Function;
  readonly getTagsFn: lambda.Function;
  readonly getNoteTagsFn: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { vpc, lambdaSg, notesTable, imagesBucket, dbInstance, dbPassword } = props;

    const dynamoEnv = {
      TABLE_NAME: notesTable.tableName,
      IMAGES_BUCKET: imagesBucket.bucketName,
      REGION: this.region,
    };

    // Tag Lambdas need both DynamoDB env vars AND RDS connection details
    const rdsEnv = {
      ...dynamoEnv,
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_PORT: dbInstance.dbInstanceEndpointPort,
      DB_NAME: 'mossywave',
      DB_USER: 'mossywave',
      DB_PASSWORD: dbPassword,
    };

    const role = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
    });

    notesTable.grantReadData(role);
    notesTable.grantWriteData(role);
    imagesBucket.grantPut(role);

    const makeLogGroup = (name: string) =>
      new logs.LogGroup(this, `${name}LogGroup`, {
        logGroupName: `/aws/lambda/mossy-wave-${name.toLowerCase()}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    const fnProps = (name: string, handler: string, env: Record<string, string>): lambda.FunctionProps => ({
      runtime: lambda.Runtime.NODEJS_22_X,
      vpc,
      securityGroups: [lambdaSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      role,
      environment: env,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      handler,
      code: lambda.Code.fromAsset('../api/dist'),
      logGroup: makeLogGroup(name),
      tracing: lambda.Tracing.ACTIVE,
    });

    // DynamoDB-backed functions
    this.listFn        = new lambda.Function(this, 'ListNotes',    fnProps('list',         'list.handler',         dynamoEnv));
    this.createFn      = new lambda.Function(this, 'CreateNote',   fnProps('create',       'create.handler',       dynamoEnv));
    this.deleteFn      = new lambda.Function(this, 'DeleteNote',   fnProps('delete',       'delete.handler',       dynamoEnv));
    this.getUploadUrlFn = new lambda.Function(this, 'GetUploadUrl', fnProps('getuploadurl', 'getUploadUrl.handler', dynamoEnv));

    // RDS-backed functions — connect to Postgres for relational tag queries
    this.addTagFn      = new lambda.Function(this, 'AddTag',       fnProps('addtag',       'addTag.handler',       rdsEnv));
    this.removeTagFn   = new lambda.Function(this, 'RemoveTag',    fnProps('removetag',    'removeTag.handler',    rdsEnv));
    this.getTagsFn     = new lambda.Function(this, 'GetTags',      fnProps('gettags',      'getTags.handler',      rdsEnv));
    this.getNoteTagsFn = new lambda.Function(this, 'GetNoteTags',  fnProps('getnotetags',  'getNoteTags.handler',  rdsEnv));
  }
}
