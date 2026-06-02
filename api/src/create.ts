import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { db, TABLE } from './_db';
import { logger } from './_logger';

interface NoteInput {
  content: string;
  url?: string;
  imageKey?: string;
}

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub ?? 'anonymous';

  let body: NoteInput;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    logger.warn('create note bad request', { reason: 'invalid JSON', userId });
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const content = body.content?.trim();
  if (!content || content.length > 500) {
    logger.warn('create note bad request', { reason: 'invalid content', userId });
    return { statusCode: 422, body: JSON.stringify({ error: 'content is required and must be <= 500 chars' }) };
  }

  const noteId = randomUUID();
  const createdAt = new Date().toISOString();

  const item = {
    noteId,
    dummy: 'NOTE',
    content,
    ...(body.url ? { url: body.url } : {}),
    ...(body.imageKey ? { imageKey: body.imageKey } : {}),
    userId,
    createdAt,
    ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };

  try {
    await db.send(new PutCommand({ TableName: TABLE, Item: item }));
    logger.info('note created', { noteId, userId, hasImage: !!body.imageKey, durationMs: Date.now() - start });
  } catch (err) {
    logger.error('create note failed', { error: String(err), userId, durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  };
}
