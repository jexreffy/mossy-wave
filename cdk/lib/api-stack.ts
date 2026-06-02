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
  addTagFn: lambda.Function;
  removeTagFn: lambda.Function;
  getTagsFn: lambda.Function;
  getNoteTagsFn: lambda.Function;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] },
    );

    this.httpApi = new apigwv2.HttpApi(this, 'NotesApi', {
      apiName: 'mossy-wave-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const route = (
      path: string,
      method: apigwv2.HttpMethod,
      fn: lambda.Function,
      auth?: apigwv2.IHttpRouteAuthorizer,
    ) =>
      this.httpApi.addRoutes({
        path,
        methods: [method],
        integration: new integrations.HttpLambdaIntegration(`${method}${path.replace(/\W/g, '')}`, fn),
        ...(auth ? { authorizer: auth } : {}),
      });

    // Notes — DynamoDB backed
    route('/notes',               apigwv2.HttpMethod.GET,    props.listFn);           // public read
    route('/notes',               apigwv2.HttpMethod.POST,   props.createFn,   jwtAuthorizer);
    route('/notes/{id}',          apigwv2.HttpMethod.DELETE, props.deleteFn,   jwtAuthorizer);
    route('/notes/upload-url',    apigwv2.HttpMethod.POST,   props.getUploadUrlFn, jwtAuthorizer);

    // Tags — RDS Postgres backed (demonstrates SQL for relational/aggregate queries)
    route('/tags',                apigwv2.HttpMethod.GET,    props.getTagsFn);         // public: trending tags
    route('/notes/{id}/tags',     apigwv2.HttpMethod.GET,    props.getNoteTagsFn);     // public: note's tags
    route('/notes/{id}/tags',     apigwv2.HttpMethod.POST,   props.addTagFn,   jwtAuthorizer);
    route('/notes/{id}/tags/{tag}', apigwv2.HttpMethod.DELETE, props.removeTagFn, jwtAuthorizer);

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }
}
