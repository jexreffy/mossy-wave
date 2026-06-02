import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  readonly notesTable: dynamodb.Table;
  readonly imagesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.notesTable = new dynamodb.Table(this, 'NotesTable', {
      partitionKey: { name: 'noteId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // GSI for time-ordered listing — PK=DUMMY (single partition), SK=createdAt
    this.notesTable.addGlobalSecondaryIndex({
      indexName: 'createdAt-index',
      partitionKey: { name: 'dummy', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Images bucket — public read (user-generated content), write via presigned URL only
    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: false,   // allow the public-read bucket policy below
        restrictPublicBuckets: false,
      }),
      // CORS: allow browsers to PUT directly to this bucket from any origin
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      // Auto-expire images after 90 days to stay within free tier
      lifecycleRules: [
        {
          id: 'expire-images',
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // Allow public read so browsers can display images directly from S3 URL
    this.imagesBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.StarPrincipal()],
        actions: ['s3:GetObject'],
        resources: [`${this.imagesBucket.bucketArn}/*`],
      }),
    );

    new cdk.CfnOutput(this, 'NotesTableName', { value: this.notesTable.tableName });
    new cdk.CfnOutput(this, 'ImagesBucketName', { value: this.imagesBucket.bucketName });
  }
}
