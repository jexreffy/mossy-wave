import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLE } from './_db';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const noteId = event.pathParameters?.id;
  if (!noteId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing note id' }) };
  }

  const clientId = event.headers['x-client-id'] ?? '';

  const existing = await db.send(new GetCommand({ TableName: TABLE, Key: { noteId } }));
  if (!existing.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  }
  if (existing.Item.clientId !== clientId) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  await db.send(new DeleteCommand({ TableName: TABLE, Key: { noteId } }));
  return { statusCode: 204, body: '' };
}
