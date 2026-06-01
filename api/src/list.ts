import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLE } from './_db';

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const result = await db.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'createdAt-index',
    KeyConditionExpression: '#d = :d',
    ExpressionAttributeNames: { '#d': 'dummy' },
    ExpressionAttributeValues: { ':d': 'NOTE' },
    ScanIndexForward: false,
    Limit: 50,
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result.Items ?? []),
  };
}
