import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLE } from './_db';
import { logger } from './_logger';

export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  try {
    const result = await db.send(new QueryCommand({
      TableName: TABLE,
      IndexName: 'createdAt-index',
      KeyConditionExpression: '#d = :d',
      ExpressionAttributeNames: { '#d': 'dummy' },
      ExpressionAttributeValues: { ':d': 'NOTE' },
      ScanIndexForward: false,
      Limit: 50,
    }));

    const count = result.Items?.length ?? 0;
    logger.info('list notes', { count, durationMs: Date.now() - start });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.Items ?? []),
    };
  } catch (err) {
    logger.error('list notes failed', { error: String(err), durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
