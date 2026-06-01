import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.REGION });
export const db = DynamoDBDocumentClient.from(client);
export const TABLE = process.env.TABLE_NAME!;
