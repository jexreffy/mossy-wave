import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface ApiStackProps extends cdk.StackProps {
  listFn: lambda.Function;
  createFn: lambda.Function;
  deleteFn: lambda.Function;
  getUploadUrlFn: lambda.Function;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // JWT authorizer — API Gateway validates Cognito tokens automatically,
    // no token verification code needed in Lambda
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: [props.userPoolClient.userPoolClientId],
      },
    );

    this.httpApi = new apigwv2.HttpApi(this, 'NotesApi', {
      apiName: 'mossy-wave-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.DELETE],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // GET /notes — public, no auth required (anyone can read the board)
    this.httpApi.addRoutes({
      path: '/notes',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('ListIntegration', props.listFn),
    });

    // POST /notes — requires valid Cognito JWT
    this.httpApi.addRoutes({
      path: '/notes',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('CreateIntegration', props.createFn),
      authorizer: jwtAuthorizer,
    });

    // DELETE /notes/{id} — requires valid Cognito JWT
    this.httpApi.addRoutes({
      path: '/notes/{id}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration('DeleteIntegration', props.deleteFn),
      authorizer: jwtAuthorizer,
    });

    // POST /notes/upload-url — returns a presigned S3 PUT URL for direct browser upload
    this.httpApi.addRoutes({
      path: '/notes/upload-url',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('GetUploadUrlIntegration', props.getUploadUrlFn),
      authorizer: jwtAuthorizer,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }
}
