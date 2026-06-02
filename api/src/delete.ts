import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { db, TABLE } from './_db';
import { logger } from './_logger';

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  const noteId = event.pathParameters?.id;
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub ?? '';

  if (!noteId) {
    logger.warn('delete note bad request', { reason: 'missing id', userId });
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing note id' }) };
  }

  try {
    const existing = await db.send(new GetCommand({ TableName: TABLE, Key: { noteId } }));
    if (!existing.Item) {
      logger.warn('delete note not found', { noteId, userId });
      return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
    }
    if (existing.Item.userId !== userId) {
      logger.warn('delete note forbidden', { noteId, userId });
      return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    await db.send(new DeleteCommand({ TableName: TABLE, Key: { noteId } }));
    logger.info('note deleted', { noteId, userId, durationMs: Date.now() - start });
    return { statusCode: 204, body: '' };
  } catch (err) {
    logger.error('delete note failed', { error: String(err), noteId, userId, durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
