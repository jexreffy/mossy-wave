import * as AWSXRay from 'aws-xray-sdk-core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Wrap the DynamoDB client with X-Ray so every query appears as a
// subsegment in the trace — makes latency visible in the Service Map
const rawClient = new DynamoDBClient({ region: process.env.REGION });
const tracedClient = AWSXRay.captureAWSv3Client(rawClient as any);
export const db = DynamoDBDocumentClient.from(tracedClient as DynamoDBClient);
export const TABLE = process.env.TABLE_NAME!;
