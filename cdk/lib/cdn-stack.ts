import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

interface CdnStackProps extends cdk.StackProps {
  httpApi: apigwv2.HttpApi;
}

export class CdnStack extends cdk.Stack {
  readonly frontendBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    // Bucket lives here to avoid a cross-stack OAC bucket-policy dependency cycle
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'Mossy Wave frontend OAC',
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(this.frontendBucket, {
      originAccessControl: oac,
    });

    // Strip cache on API calls so reads are always fresh
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'ApiCachePolicy', {
      defaultTtl: cdk.Duration.seconds(0),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Content-Type', 'X-Client-Id'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    });

    const apiDomain = `${props.httpApi.httpApiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com`;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'mossy-wave',
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: apiCachePolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        // SPA fallback — send all 404s to index.html
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Public URL for Mossy Wave',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', { value: this.frontendBucket.bucketName });
  }
}
