import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

interface ObservabilityStackProps extends cdk.StackProps {
  listFn: lambda.Function;
  createFn: lambda.Function;
  deleteFn: lambda.Function;
  getUploadUrlFn: lambda.Function;
  httpApi: apigwv2.HttpApi;
  alertEmail: string;
}

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { listFn, createFn, deleteFn, getUploadUrlFn, httpApi, alertEmail } = props;
    const functions = [listFn, createFn, deleteFn, getUploadUrlFn];
    const fnNames = ['list', 'create', 'delete', 'getUploadUrl'];

    // ── SNS topic for alarm notifications ──────────────────────────────────
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      displayName: 'Mossy Wave Alerts',
    });
    alertTopic.addSubscription(new snsSubscriptions.EmailSubscription(alertEmail));

    // ── Log Metric Filters — count ERROR lines across all Lambda log groups ─
    // One metric per function, plus a combined aggregate
    const errorMetrics: cloudwatch.Metric[] = functions.map((fn, i) => {
      const logGroup = logs.LogGroup.fromLogGroupName(
        this, `LG${i}`, `/aws/lambda/mossy-wave-${fnNames[i].toLowerCase()}`,
      );
      const filter = new logs.MetricFilter(this, `ErrorFilter${i}`, {
        logGroup,
        metricNamespace: 'MossyWave',
        metricName: `${fnNames[i]}Errors`,
        filterPattern: logs.FilterPattern.stringValue('$.level', '=', 'ERROR'),
        metricValue: '1',
        defaultValue: 0,
      });
      return filter.metric({ statistic: 'Sum', period: cdk.Duration.minutes(5) });
    });

    // ── CloudWatch Alarms ───────────────────────────────────────────────────

    // Alarm: any Lambda error in a 5-min window
    functions.forEach((fn, i) => {
      const alarm = new cloudwatch.Alarm(this, `ErrorAlarm${i}`, {
        alarmName: `mossy-wave-${fnNames[i]}-errors`,
        alarmDescription: `${fnNames[i]} Lambda logged an ERROR`,
        metric: errorMetrics[i],
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new actions.SnsAction(alertTopic));
    });

    // Alarm: Lambda error rate from built-in metrics (catches runtime crashes too)
    functions.forEach((fn, i) => {
      const errRate = new cloudwatch.MathExpression({
        expression: 'errors / invocations * 100',
        usingMetrics: {
          errors: fn.metricErrors({ period: cdk.Duration.minutes(5) }),
          invocations: fn.metricInvocations({ period: cdk.Duration.minutes(5) }),
        },
        label: `${fnNames[i]} error rate (%)`,
      });
      const alarm = new cloudwatch.Alarm(this, `ErrorRateAlarm${i}`, {
        alarmName: `mossy-wave-${fnNames[i]}-error-rate`,
        alarmDescription: `${fnNames[i]} error rate exceeded 10%`,
        metric: errRate,
        threshold: 10,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new actions.SnsAction(alertTopic));
    });

    // Alarm: high p99 Lambda duration (list function — most frequently called)
    const durationAlarm = new cloudwatch.Alarm(this, 'ListDurationAlarm', {
      alarmName: 'mossy-wave-list-duration-p99',
      alarmDescription: 'list Lambda p99 duration exceeded 3s',
      metric: listFn.metricDuration({
        statistic: 'p99',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    durationAlarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // ── CloudWatch Dashboard ────────────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'MossyWave',
    });

    // Row 1: Lambda invocations + errors per function
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        width: 12,
        left: functions.map(fn => fn.metricInvocations({ period: cdk.Duration.minutes(5) })),
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        width: 12,
        left: functions.map(fn => fn.metricErrors({ period: cdk.Duration.minutes(5) })),
      }),
    );

    // Row 2: Duration (p50 + p99) + throttles
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration — p50 vs p99 (ms)',
        width: 12,
        left: functions.map(fn => fn.metricDuration({ statistic: 'p50', period: cdk.Duration.minutes(5) })),
        right: functions.map(fn => fn.metricDuration({ statistic: 'p99', period: cdk.Duration.minutes(5) })),
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Throttles',
        width: 12,
        left: functions.map(fn => fn.metricThrottles({ period: cdk.Duration.minutes(5) })),
      }),
    );

    // Row 3: Structured log ERROR counts (from metric filters) + alarm states
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Application Errors (from structured logs)',
        width: 12,
        left: errorMetrics,
      }),
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        width: 12,
        alarms: [durationAlarm],
      }),
    );

    // Row 4: API Gateway metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway — Requests',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiId: httpApi.httpApiId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Total requests',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway — 4xx / 5xx',
        width: 12,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4xx',
            dimensionsMap: { ApiId: httpApi.httpApiId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: '4xx errors',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5xx',
            dimensionsMap: { ApiId: httpApi.httpApiId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: '5xx errors',
          }),
        ],
      }),
    );

    // ── CloudTrail — audit log of all AWS API calls ─────────────────────────
    const trailBucket = new s3.Bucket(this, 'TrailBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
    });

    new cloudtrail.Trail(this, 'Trail', {
      bucket: trailBucket,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: false,  // single region keeps it free
      sendToCloudWatchLogs: false, // skip CW Logs to avoid cost
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home#dashboards:name=MossyWave`,
      description: 'CloudWatch Dashboard URL',
    });
    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
  }
}
